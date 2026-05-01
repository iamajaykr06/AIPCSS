# Scheduling Algorithm Documentation

AIPCSS implements multiple scheduling algorithms to generate conflict-free, optimized timetables. This document describes the design and implementation of each algorithm.

## Problem Definition

The classroom scheduling problem is a variant of the **Constraint Satisfaction Problem (CSP)**. Given:
- A set of courses to be scheduled
- Available teachers and their constraints
- Available rooms with capacity limits
- Time slots (days × periods)
- Various hard and soft constraints

Find an assignment of courses to (teacher, room, time-slot) tuples that satisfies all constraints.

## Constraints

### Hard Constraints (must be satisfied)
- A teacher cannot be assigned to two courses at the same time
- A room cannot host two courses simultaneously
- A section cannot have two classes at the same time
- Room capacity must be sufficient for the section size
- Teacher must be available at the assigned time slot
- Courses requiring special rooms must be assigned accordingly

### Soft Constraints (should be optimized)
- Minimize gaps in teacher schedules
- Distribute workload evenly across teachers
- Prefer rooms that closely match section sizes
- Avoid scheduling heavy subjects in the last period
- Minimize room changes for consecutive classes of a section

## Algorithm 1: OR-Tools CP-SAT Solver

**File:** `backend/app/scheduler_new/ortools_engine.py`

Google OR-Tools CP-SAT (Constraint Programming with SAT solver) is used as the primary optimization engine. It models the scheduling problem as a constraint satisfaction problem and finds optimal or near-optimal solutions.

### How It Works

1. **Variable Creation**: For each course-section pair, create boolean variables for each possible (day, period, room) assignment
2. **Constraint Addition**: Encode all hard and soft constraints as linear constraints
3. **Objective Function**: Define an objective that minimizes soft constraint violations
4. **Solving**: Use the CP-SAT solver to find the optimal assignment

### Strengths
- Guarantees optimal or near-optimal solutions for small to medium instances
- Handles complex constraint interactions naturally
- Well-suited for institutional-scale problems (up to ~500 courses)

### Limitations
- May be slow for very large instances (1000+ courses)
- Requires careful constraint modeling

## Algorithm 2: Genetic Algorithm

**File:** `backend/app/scheduler_new/genetic_engine.py`

An evolutionary approach inspired by natural selection that searches the solution space efficiently.

### How It Works

1. **Encoding**: Each chromosome represents a complete timetable assignment
2. **Population Initialization**: Generate initial population of random feasible schedules
3. **Fitness Evaluation**: Score each schedule based on constraint satisfaction
4. **Selection**: Use tournament selection to choose parent chromosomes
5. **Crossover**: Combine parent chromosomes to produce offspring
6. **Mutation**: Randomly modify offspring to maintain diversity
7. **Replacement**: Replace worst individuals in population with offspring
8. **Termination**: Stop after max generations or when fitness converges

### Parameters
- Population size: 100
- Max generations: 500
- Crossover rate: 0.8
- Mutation rate: 0.1
- Tournament size: 5

### Strengths
- Handles large problem instances well
- Can escape local optima
- Parallelizable nature of population evaluation

### Limitations
- No guarantee of optimality
- Requires parameter tuning
- May produce different results across runs

## Algorithm 3: Greedy Algorithm

**File:** `backend/app/scheduler_new/greedy_engine.py`

A fast heuristic-based approach for quick schedule generation.

### How It Works

1. **Prioritization**: Sort courses by difficulty (most constrained first)
2. **Assignment**: For each course, assign the best available slot using heuristics:
   - Earliest available time slot
   - Smallest adequate room (to leave larger rooms for bigger classes)
   - Teacher preference alignment
3. **Conflict Resolution**: If no slot available, backtrack and try alternatives

### Strengths
- Very fast execution (milliseconds)
- Deterministic results
- Good for initial schedule drafts

### Limitations
- May not find optimal solutions
- Can get stuck in suboptimal assignments

## Algorithm 4: Hybrid Engine

**File:** `backend/app/scheduler_new/hybrid_engine.py`

Combines the genetic algorithm with the greedy approach for balanced results.

### How It Works

1. **Initialization**: Use the greedy algorithm to generate the initial population (instead of random)
2. **Genetic Optimization**: Run the genetic algorithm on this seeded population
3. **Local Search**: Apply greedy local search to refine the best solution found
4. **Repair**: If any hard constraints are violated, apply targeted repair strategies

### Strengths
- Faster convergence than pure genetic algorithm
- Better initial solutions through greedy seeding
- Combines speed with quality

## Engine Selection

**File:** `backend/app/scheduler_new/scheduler_engine.py`

The system automatically recommends an engine based on problem size:

| Problem Size | Courses | Recommended Engine |
|--------------|---------|-------------------|
| Small        | < 100   | OR-Tools           |
| Medium       | 100-500 | OR-Tools / Hybrid  |
| Large        | > 500   | Hybrid / Genetic   |
| Quick Draft  | Any     | Greedy             |

Users can override this recommendation in the scheduling settings.
