import time
import random
import logging
from typing import List, Tuple, Optional, Dict, Callable
from collections import defaultdict
import copy

from .models import ScheduleEntry, SchedulingProblem, ScheduleResult, AssignmentVariable, DomainValue
from .constraint_engine import ConstraintEngine

class GeneticSchedulerEngine:
    """
    Enhanced Genetic Algorithm based scheduler with:
    - Adaptive mutation rate
    - Multiple crossover operators (single-point, two-point, uniform)
    - Local search (hill climbing) for better convergence
    - Early termination on stagnation
    - Hybrid GA + local repair approach
    """
    
    def __init__(self, problem: SchedulingProblem, debug: bool = False, max_retries: int = 3, time_limit_seconds: float = 300.0,
                 population_size: int = 100, mutation_rate: float = 0.1, tournament_size: int = 5, elite_size: int = 2,
                 use_local_search: bool = True, local_search_intensity: int = 10):
        self.problem = problem
        self.debug = debug
        self.max_retries = max_retries
        self.time_limit = time_limit_seconds
        
        self.population_size = population_size
        self.base_mutation_rate = mutation_rate
        self.tournament_size = tournament_size
        self.elite_size = elite_size
        self.use_local_search = use_local_search
        self.local_search_intensity = local_search_intensity
        
        self.logger = logging.getLogger(__name__)
        if debug:
            logging.basicConfig(level=logging.DEBUG)
            
        self.variables = self._get_variables()
        self.domains: Dict[Tuple[int, int, int], List[DomainValue]] = {}
        self.start_time = 0.0
        self.slot_keys_cache = {}
        
        # Adaptive parameters
        self.current_mutation_rate = mutation_rate
        self.stagnation_counter = 0
        self.stagnation_threshold = 30  # generations without improvement

    def _get_variables(self) -> List[AssignmentVariable]:
        instances = []
        for section in self.problem.sections:
            for course_id in section.course_ids:
                course = self.problem.course_map.get(course_id)
                if course:
                    if course.course_type == "Lab":
                        instances.append(AssignmentVariable(
                            section_id=section.id,
                            course_id=course_id,
                            hours_needed=course.get_hours_needed()
                        ))
                    else:
                        for _ in range(course.get_hours_needed()):
                            instances.append(AssignmentVariable(
                                section_id=section.id,
                                course_id=course_id,
                                hours_needed=1
                            ))
        return instances
        
    def _precompute_domains(self):
        """Precompute all unary-valid (faculty, room, timeslot) domains for each variable"""
        ce = ConstraintEngine(self.problem, self.debug)
        
        # Precompute timeslot sequences for quick lookup
        self.slot_keys_cache = {}
        day_slots_map = defaultdict(list)
        for t in self.problem.timeslots:
            day_slots_map[t.day].append(t)
        for day in day_slots_map:
            day_slots_map[day].sort(key=lambda x: x.start_time)
            
        max_hours = max([v.hours_needed for v in self.variables] + [1]) if self.variables else 1
        for t in self.problem.timeslots:
            for hours in range(1, max_hours + 1):
                if hours == 1:
                    self.slot_keys_cache[(t, hours)] = [(t.day, t.start_time)]
                    continue
                day_slots = day_slots_map[t.day]
                try:
                    idx = day_slots.index(t)
                    if idx + hours <= len(day_slots):
                        consecutive = day_slots[idx:idx+hours]
                        self.slot_keys_cache[(t, hours)] = [(s.day, s.start_time) for s in consecutive]
                    else:
                        self.slot_keys_cache[(t, hours)] = None
                except ValueError:
                    self.slot_keys_cache[(t, hours)] = None
        
        for var in self.variables:
            valid_options = []
            section = self.problem.section_map.get(var.section_id)
            course = self.problem.course_map.get(var.course_id)
            if not section or not course:
                continue
                
            for timeslot in self.problem.timeslots:
                if not self.slot_keys_cache.get((timeslot, var.hours_needed)):
                    continue
                
                valid_faculties = ce.get_valid_faculty(var.section_id, var.course_id, timeslot)
                if not valid_faculties: continue
                
                valid_rooms = ce.get_valid_rooms(var.section_id, var.course_id, timeslot)
                if not valid_rooms: continue
                
                valid_options.append({
                    "timeslot": timeslot,
                    "faculties": valid_faculties,
                    "rooms": valid_rooms
                })
            
            self.domains[(var.section_id, var.course_id, var.hours_needed)] = valid_options

        # MRV Heuristic: Sort variables by Most Constrained First (fewest domain options)
        self.variables.sort(key=lambda var: sum(len(opt["faculties"]) * len(opt["rooms"]) for opt in self.domains.get((var.section_id, var.course_id, var.hours_needed), [])))

    def _get_random_domain_sample(self, var, max_samples=10) -> List[DomainValue]:
        domain = self.domains.get((var.section_id, var.course_id, var.hours_needed), [])
        if not domain:
            return []
        samples = []
        for _ in range(max_samples):
            opt = random.choice(domain)
            samples.append(DomainValue(
                faculty_id=random.choice(opt["faculties"]),
                room_id=random.choice(opt["rooms"]),
                timeslot=opt["timeslot"]
            ))
        return samples

    def _evaluate(self, individual: List[Optional[DomainValue]]) -> Tuple[int, Dict[str, int]]:
        """
        Calculate conflicts with enhanced fitness function using O(1) flat sets for blazing fast evaluation:
        - Hard constraints: overlaps, availability, capacity
        - Soft constraints: load balancing, preference optimization
        """
        faculty_schedule = set()
        room_schedule = set()
        section_schedule = set()
        section_daily_courses = set()

        
        faculty_hours = defaultdict(int)
        faculty_daily_hours = defaultdict(int)
        
        conflicts = 0
        detailed_conflicts = defaultdict(int)
        
        # Track load for soft constraint evaluation
        faculty_load = defaultdict(int)
        
        for i, var in enumerate(self.variables):
            val = individual[i]
            if val is None:
                conflicts += 1000  # Heavy penalty for unassignable
                detailed_conflicts['unassigned'] += 1
                continue
                
            slot_keys = self.slot_keys_cache.get((val.timeslot, var.hours_needed))
            if not slot_keys:
                conflicts += 500
                continue
            
            # Repetition Constraints: Ensure 1-hour theory constraints don't repeat uniformly on the exact same day for the batch
            if var.hours_needed == 1:
                sd_key = (var.section_id, val.timeslot.day, var.course_id)
                if sd_key in section_daily_courses:
                    conflicts += 100
                    detailed_conflicts['course_daily_repeat'] += 1
                section_daily_courses.add(sd_key)
            
            for slot_key in slot_keys:
                f_slot = (val.faculty_id, slot_key)
                r_slot = (val.room_id, slot_key)
                s_slot = (var.section_id, slot_key)
                
                # Hard constraint: Faculty overlap
                if f_slot in faculty_schedule:
                    conflicts += 100  # High penalty for hard constraint violation
                    detailed_conflicts['faculty_overlap'] += 1
                else:
                    faculty_schedule.add(f_slot)
                    
                # Hard constraint: Room overlap
                if r_slot in room_schedule:
                    conflicts += 100
                    detailed_conflicts['room_overlap'] += 1
                else:
                    room_schedule.add(r_slot)
                    
                # Hard constraint: Section overlap
                if s_slot in section_schedule:
                    conflicts += 100
                    detailed_conflicts['section_overlap'] += 1
                else:
                    section_schedule.add(s_slot)
            
            faculty_hours[val.faculty_id] += var.hours_needed
            faculty_daily_hours[(val.faculty_id, val.timeslot.day)] += var.hours_needed
            
            # Track load for soft constraints
            faculty_load[val.faculty_id] += var.hours_needed
        
        # Hard constraint: Faculty max hours per week
        for f_id, hours in faculty_hours.items():
            faculty = self.problem.faculty_map.get(f_id)
            if faculty and hours > faculty.max_hours_per_week:
                diff = hours - faculty.max_hours_per_week
                conflicts += diff * 50  # Penalty proportional to overload
                detailed_conflicts['faculty_overload'] += diff
        
        # Hard constraint: Faculty max hours per day
        for (f_id, day), day_h in faculty_daily_hours.items():
            faculty = self.problem.faculty_map.get(f_id)
            if faculty and day_h > faculty.max_hours_per_day:
                diff = day_h - faculty.max_hours_per_day
                conflicts += diff * 50
                detailed_conflicts['faculty_daily_overload'] += diff
        
        # Soft constraint: Load balancing (prefer balanced schedules)
        if faculty_load:
            avg_load = sum(faculty_load.values()) / len(faculty_load)
            load_variance = sum((load - avg_load) ** 2 for load in faculty_load.values()) / len(faculty_load)
            conflicts += int(load_variance * 0.1)  # Small penalty for imbalance
            detailed_conflicts['load_imbalance'] = int(load_variance)
        
        return conflicts, dict(detailed_conflicts)

    def _generate_random_individual(self) -> List[Optional[DomainValue]]:
        individual = []
        for var in self.variables:
            domain = self.domains.get((var.section_id, var.course_id, var.hours_needed), [])
            if domain:
                opt = random.choice(domain)
                individual.append(DomainValue(
                    faculty_id=random.choice(opt["faculties"]),
                    room_id=random.choice(opt["rooms"]),
                    timeslot=opt["timeslot"]
                ))
            else:
                individual.append(None)
        return individual
        
    def _crossover_single_point(self, parent1: List[Optional[DomainValue]], parent2: List[Optional[DomainValue]]) -> Tuple[List[Optional[DomainValue]], List[Optional[DomainValue]]]:
        """Single-point crossover"""
        if len(self.variables) < 2:
            return list(parent1), list(parent2)
        point = random.randint(1, len(self.variables) - 1)
        child1 = parent1[:point] + parent2[point:]
        child2 = parent2[:point] + parent1[point:]
        return child1, child2
    
    def _crossover_two_point(self, parent1: List[Optional[DomainValue]], parent2: List[Optional[DomainValue]]) -> Tuple[List[Optional[DomainValue]], List[Optional[DomainValue]]]:
        """Two-point crossover"""
        if len(self.variables) < 3:
            return self._crossover_single_point(parent1, parent2)
        point1 = random.randint(1, len(self.variables) - 2)
        point2 = random.randint(point1 + 1, len(self.variables) - 1)
        child1 = parent1[:point1] + parent2[point1:point2] + parent1[point2:]
        child2 = parent2[:point1] + parent1[point1:point2] + parent2[point2:]
        return child1, child2
    
    def _crossover_uniform(self, parent1: List[Optional[DomainValue]], parent2: List[Optional[DomainValue]]) -> Tuple[List[Optional[DomainValue]], List[Optional[DomainValue]]]:
        """Uniform crossover - each gene from random parent"""
        child1 = []
        child2 = []
        for i in range(len(self.variables)):
            if random.random() < 0.5:
                child1.append(parent1[i])
                child2.append(parent2[i])
            else:
                child1.append(parent2[i])
                child2.append(parent1[i])
        return child1, child2
    
    def _crossover(self, parent1: List[Optional[DomainValue]], parent2: List[Optional[DomainValue]]) -> Tuple[List[Optional[DomainValue]], List[Optional[DomainValue]]]:
        """Adaptive crossover: randomly select operator"""
        operator = random.choice(['single', 'two_point', 'uniform'])
        if operator == 'single':
            return self._crossover_single_point(parent1, parent2)
        elif operator == 'two_point':
            return self._crossover_two_point(parent1, parent2)
        else:
            return self._crossover_uniform(parent1, parent2)
        
    def _mutate(self, individual: List[Optional[DomainValue]]) -> List[Optional[DomainValue]]:
        """Mutation with adaptive rate"""
        mutated = list(individual)
        for i, var in enumerate(self.variables):
            if random.random() < self.current_mutation_rate:
                sampled = self._get_random_domain_sample(var, 5)
                if sampled:
                    if len(sampled) > 1 and random.random() < 0.5:
                        current_val = mutated[i]
                        available = [d for d in sampled if d != current_val]
                        if available:
                            mutated[i] = random.choice(available)
                    else:
                        mutated[i] = random.choice(sampled)
        return mutated
    
    def _local_search_hill_climbing(self, individual: List[Optional[DomainValue]], max_iterations: int = 10) -> List[Optional[DomainValue]]:
        """
        Hill climbing local search to improve individual quality.
        Tries to fix conflicts by changing individual genes.
        """
        current = list(individual)
        current_fitness, _ = self._evaluate(current)
        
        for _ in range(max_iterations):
            if current_fitness == 0:
                break
                
            # Find a gene to improve
            improved = False
            indices = list(range(len(self.variables)))
            random.shuffle(indices)
            
            for i in indices:
                var = self.variables[i]
                domain = self.domains.get((var.section_id, var.course_id, var.hours_needed), [])
                if not domain:
                    continue
                    
                search_domain = self._get_random_domain_sample(var, 15)
                
                current_val = current[i]
                for new_val in search_domain:
                    if new_val == current_val:
                        continue
                        
                    # Try this change
                    old_val = current[i]
                    current[i] = new_val
                    new_fitness, _ = self._evaluate(current)
                    
                    if new_fitness < current_fitness:
                        current_fitness = new_fitness
                        improved = True
                        break
                    else:
                        current[i] = old_val  # Revert
                
                if improved:
                    break
            
            if not improved:
                break  # Local optimum reached
        
        return current
    
    def _repair_individual(self, individual: List[Optional[DomainValue]]) -> List[Optional[DomainValue]]:
        """
        Repair function: fix obvious conflicts by greedy assignment with MRV.
        """
        repaired = list(individual)
        faculty_schedule = set()
        room_schedule = set()
        section_schedule = set()
        
        # First pass: identify conflicts
        conflict_indices = []
        for i, var in enumerate(self.variables):
            val = repaired[i]
            if val is None:
                conflict_indices.append(i)
                continue
                
            slot_keys = self.slot_keys_cache.get((val.timeslot, var.hours_needed))
            if not slot_keys:
                conflict_indices.append(i)
                continue
                
            has_conflict = False
            for slot_key in slot_keys:
                if ((val.faculty_id, slot_key) in faculty_schedule or
                    (val.room_id, slot_key) in room_schedule or
                    (var.section_id, slot_key) in section_schedule):
                    has_conflict = True
                    break
                    
            if has_conflict:
                conflict_indices.append(i)
            else:
                for slot_key in slot_keys:
                    faculty_schedule.add((val.faculty_id, slot_key))
                    room_schedule.add((val.room_id, slot_key))
                    section_schedule.add((var.section_id, slot_key))
        
        # Most Constrained First heuristic
        conflict_indices.sort(key=lambda i: len(self.domains.get((self.variables[i].section_id, self.variables[i].course_id, self.variables[i].hours_needed), [])))
        
        # Second pass: repair conflicts
        for i in conflict_indices:
            var = self.variables[i]
            domain = self.domains.get((var.section_id, var.course_id, var.hours_needed), [])
            if not domain:
                continue
                
            # Restrict repair to opportunistic shuffling instead of an exhaustive loop
            search_domain = self._get_random_domain_sample(var, 50)
                
            # Find a conflict-free assignment
            for val in search_domain:
                slot_keys = self.slot_keys_cache.get((val.timeslot, var.hours_needed))
                if not slot_keys: continue
                
                has_conflict = False
                for slot_key in slot_keys:
                    if ((val.faculty_id, slot_key) in faculty_schedule or
                        (val.room_id, slot_key) in room_schedule or
                        (var.section_id, slot_key) in section_schedule):
                        has_conflict = True
                        break
                        
                if not has_conflict:
                    repaired[i] = val
                    for slot_key in slot_keys:
                        faculty_schedule.add((val.faculty_id, slot_key))
                        room_schedule.add((val.room_id, slot_key))
                        section_schedule.add((var.section_id, slot_key))
                    break
        
        return repaired
    
    def _adaptive_mutation(self, generation: int, improvement: bool):
        """
        Adapt mutation rate based on convergence.
        Increase mutation if stagnating, decrease if improving.
        """
        if improvement:
            self.stagnation_counter = 0
            # Decrease mutation slightly when improving
            self.current_mutation_rate = max(0.05, self.current_mutation_rate * 0.95)
        else:
            self.stagnation_counter += 1
            # Increase mutation when stagnating
            if self.stagnation_counter > self.stagnation_threshold:
                self.current_mutation_rate = min(0.5, self.current_mutation_rate * 1.2)
                self.stagnation_counter = 0  # Reset after adjustment
        
    def solve(self, progress_callback: Optional[Callable[[int, str], None]] = None) -> ScheduleResult:
        if progress_callback:
            progress_callback(5, "Precomputing domains...")
            
        self.start_time = time.time()
        self._precompute_domains()
        
        # Check if all variables have at least one domain value
        for var in self.variables:
            key = (var.section_id, var.course_id, var.hours_needed)
            if not self.domains.get(key):
                if progress_callback:
                    progress_callback(100, "Failed: Impossible constraints")
                return ScheduleResult(success=False, error_message=f"No valid assignment possible for section {var.section_id} course {var.course_id}.")
                
        if progress_callback:
            progress_callback(15, f"Initializing population (size: {self.population_size})")
            
        population = [self._generate_random_individual() for _ in range(self.population_size)]
        
        # Adaptive generation limit based on problem size
        base_generations = 300
        adaptive_generations = min(500, max(base_generations, len(self.variables) * 2))
        
        best_individual = None
        best_conflicts = float('inf')
        best_details = {}
        generation = 0
        
        for generation in range(adaptive_generations):
            if time.time() - self.start_time > self.time_limit:
                if progress_callback:
                    progress_callback(95, "Time limit reached")
                break
                
            # Evaluate fitness
            fitness_scores = []
            improvement = False
            for ind in population:
                conflicts, details = self._evaluate(ind)
                fitness_scores.append((conflicts, ind, details))
                
                # Track best
                if conflicts < best_conflicts:
                    improvement = True
                    best_conflicts = conflicts
                    best_individual = list(ind)
                    best_details = details
                    
                    # Early termination if perfect solution found
                    if best_conflicts == 0:
                        if self.use_local_search:
                            best_individual = self._local_search_hill_climbing(best_individual, self.local_search_intensity)
                        break
            
            # Adaptive mutation
            self._adaptive_mutation(generation, improvement)
                    
            if progress_callback and generation % 20 == 0:
                progress_val = min(90, 15 + int((generation/adaptive_generations)*75))
                progress_callback(progress_val, f"GA Gen {generation}, Best: {best_conflicts}, Mut: {self.current_mutation_rate:.3f}")
                
            # Early termination on stagnation
            if self.stagnation_counter > self.stagnation_threshold * 2:
                if self.debug:
                    self.logger.debug(f"Stagnation detected at generation {generation}")
                break
                
            # Sort by fitness (lowest conflicts)
            fitness_scores.sort(key=lambda x: x[0])
            
            new_population = []
            
            # Elitism - keep best individuals
            for i in range(self.elite_size):
                elite = fitness_scores[i][1]
                # Apply local search to elite individuals
                if self.use_local_search and random.random() < 0.3:
                    elite = self._local_search_hill_climbing(elite, self.local_search_intensity // 2)
                new_population.append(elite)
                
            # Generate rest of new population
            while len(new_population) < self.population_size:
                # Tournament selection
                tournament1 = random.sample(fitness_scores, min(self.tournament_size, len(fitness_scores)))
                tournament2 = random.sample(fitness_scores, min(self.tournament_size, len(fitness_scores)))
                
                parent1 = min(tournament1, key=lambda x: x[0])[1]
                parent2 = min(tournament2, key=lambda x: x[0])[1]
                
                child1, child2 = self._crossover(parent1, parent2)
                
                child1 = self._mutate(child1)
                child2 = self._mutate(child2)
                
                # Apply repair to offspring
                if random.random() < 0.2:
                    child1 = self._repair_individual(child1)
                if random.random() < 0.2:
                    child2 = self._repair_individual(child2)
                
                new_population.append(child1)
                if len(new_population) < self.population_size:
                    new_population.append(child2)
                    
            population = new_population

        elapsed = time.time() - self.start_time
        
        # Final local search on best solution
        if best_individual and self.use_local_search:
            if progress_callback:
                progress_callback(92, "Applying local search...")
            best_individual = self._local_search_hill_climbing(best_individual, self.local_search_intensity)
            best_conflicts, best_details = self._evaluate(best_individual)
        
        schedule = []
        if best_individual:
            for i, var in enumerate(self.variables):
                val = best_individual[i]
                if val:
                    schedule.append(ScheduleEntry(
                        section_id=var.section_id,
                        course_id=var.course_id,
                        faculty_id=val.faculty_id,
                        room_id=val.room_id,
                        timeslot=val.timeslot
                    ))
                    
        success = (best_conflicts == 0)
        
        if progress_callback:
            progress_callback(100, "Schedule generated successfully" if success else "Failed to resolve all conflicts")
            
        return ScheduleResult(
            success=success,
            schedule=schedule,
            error_message="Could not resolve all conflicts" if not success else None,
            conflicts=best_details,
            stats={
                "time_seconds": elapsed,
                "generations_run": generation + 1,
                "best_conflicts": best_conflicts,
                "total_classes": len(self.variables),
                "algorithm": "Enhanced Genetic Algorithm",
                "final_mutation_rate": self.current_mutation_rate,
                "population_size": self.population_size
            }
        )
