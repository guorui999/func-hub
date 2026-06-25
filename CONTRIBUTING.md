# Contributing to FuncHub

## Local Development

### Prerequisites

- Python 3.10+
- Node.js 18+
- GitHub Personal Access Token with `repo` and `workflow` scopes

### Setup

```bash
# Clone the monorepo
git clone https://github.com/funchub/funchub.git
cd funchub

# Python
cd python
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# NestJS
cd ../nestjs
npm install
```

### Running Tests

```bash
# Python
cd python
pytest --cov=funchub --cov-fail-under=85

# NestJS
cd nestjs
npm test -- --coverage --coverageThreshold='{"global":{"lines":85}}'
```

### PR Workflow

1. Create a feature branch from `main`.
2. Make your changes and ensure all tests pass.
3. Run the linter/formatter.
4. Open a pull request against `main`.
5. The CI pipeline will run tests for both Python and NestJS.

### Code Style

- Python: `black`, `ruff`, `mypy` (strict)
- TypeScript: `prettier`, `eslint`, strict `tsconfig`

## Publishing

Only maintainers can trigger releases. A tag push (`v*`) triggers the
publish workflow that deploys to PyPI and NPM.
