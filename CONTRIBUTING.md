# Contributing to AIPCSS

Thank you for your interest in contributing to **AIPCSS** (AI-Powered Smart Classroom Scheduling System)! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, inclusive, and constructive in all interactions.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/AIPCSS.git
   cd AIPCSS
   ```
3. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Making Changes

- Follow the existing code style and patterns
- Write clean, readable, and well-documented code
- Add appropriate comments for complex logic
- Ensure all existing tests pass before submitting
- Test your changes thoroughly across different scenarios

## Commit Messages

Use clear and descriptive commit messages following this format:

```
type(scope): brief description

Detailed explanation if needed.
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**
```
feat(scheduler): add genetic algorithm crossover operators
fix(auth): resolve token expiration edge case
docs(api): update scheduling endpoint documentation
```

## Pull Request Process

1. Ensure your branch is up to date with `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
2. Push your changes to your fork
3. Open a Pull Request against the `main` branch
4. Provide a clear description of the changes and their purpose
5. Respond to review feedback promptly
6. Ensure CI checks pass (if applicable)

## Reporting Bugs

Please open a [Bug Report](https://github.com/iamajaykr06/AIPCSS/issues/new?template=bug_report.md) with:

- A clear description of the bug
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots if applicable
- Your environment (OS, Node.js version, Python version)

## Suggesting Features

Please open a [Feature Request](https://github.com/iamajaykr06/AIPCSS/issues/new?template=feature_request.md) with:

- A clear description of the feature
- The motivation or use case
- Any proposed implementation ideas

Thank you for contributing!
