# **AI Agent Guidelines for {{PROJECT_NAME}}**

This document provides guidelines for AI agents and human developers working on **{{PROJECT_NAME}}**, a project built with the MAIA (Modular AI-driven Application) Toolkit.

## **1. Project Overview**

**{{PROJECT_NAME}}** is a modular application developed using the MAIA framework, which emphasizes:
- **Modular architecture** with well-defined component boundaries
- **AI-driven development** with structured specifications
- **Quality-first approach** with testing and linting baked in
- **Clear documentation** at every level

### **Project Structure**

```
{{PROJECT_NAME}}/
├── README.md                    # Project overview and setup
├── AGENTS.md                    # This file - AI agent guidelines
├── CONTRIBUTING.md              # Contribution workflow
├── project-manifest.yaml        # Central project registry
├── docs/                        # All project documentation
│   ├── requirements/            # Functional & non-functional requirements
│   ├── standards/               # Coding standards and conventions
│   ├── adr/                     # Architecture Decision Records
│   └── work-items/              # Task tracking and planning
├── modules/                     # Application modules
│   └── [module-name]/          # Each module is self-contained
│       ├── README.md
│       ├── spec.yaml           # Module specification
│       ├── src/                # Source code
│       ├── tests/              # Module tests
│       └── docs/               # Module-specific docs
├── workflows/                   # CI/CD automation
└── standards/                   # Additional project standards
```

## **2. MAIA Development Process**

### **Phase 1: Project Setup (Completed)**

Phase 1 has already been completed for this project. It established:
1. ✅ **Project Manifest** - Central registry in `project-manifest.yaml`
2. ✅ **Technology Stack** - Selected and documented
3. ✅ **Requirements** - Functional and non-functional requirements defined
4. ✅ **Coding Standards** - Technology-specific standards generated
5. ✅ **Initial Modules** - Core module specifications created

**Key Artifacts:**
- `project-manifest.yaml` - Read this first to understand the project
- `docs/requirements/functional_requirements.md` - What the system must do
- `docs/requirements/non_functional_requirements.md` - How the system must perform
- `docs/standards/coding_standards.md` - How to write code for this project (Note: This file is generated during Phase 1 and will not exist in a freshly initialized project)

### **Phase 2: Module Development (Active)**

You are now in Phase 2, where development happens module by module. Each module follows this workflow:

1. **Read the Module Specification** - Located in `modules/[module-name]/spec.yaml`
2. **Implement the Module** - Following the spec and coding standards
3. **Write Tests** - Unit tests and integration tests as defined in spec
4. **Document the Module** - Update module README and inline documentation
5. **Run Quality Checks** - Lint and test before committing
6. **Create Work Items** - Track progress in `docs/work-items/`

## **3. Module Development Guidelines**

### **Working with Module Specifications**

Every module has a `spec.yaml` file that defines:
- **Purpose** - What the module does
- **Dependencies** - What it relies on
- **API/Interface** - How other modules interact with it
- **Data Models** - Entities and relationships
- **Requirements** - Functional requirements this module fulfills
- **Test Strategy** - How to verify correctness

**Always read the module specification before starting development.**

### **Module Implementation Checklist**

When implementing a module:
- [ ] Read and understand the module specification
- [ ] Review dependencies and ensure they're available
- [ ] Follow the coding standards in `docs/standards/coding_standards.md`
- [ ] Implement all required functionality from the spec
- [ ] Write tests according to the test strategy
- [ ] Document public APIs and complex logic
- [ ] Run linter and fix all issues
- [ ] Run tests and ensure 100% pass
- [ ] Update module README if needed
- [ ] Create work items for any discovered gaps

### **Code Quality Standards**

All code must adhere to:
1. **Project Coding Standards** - See `docs/standards/coding_standards.md`
2. **Testing Requirements** - Minimum coverage and test types from spec
3. **Linting Rules** - Zero linting errors before commit
4. **Documentation** - Public APIs must be documented
5. **Security** - Input validation, secure defaults, no hardcoded secrets

## **4. Git Workflow**

### **Branch Strategy**

Use feature branches for all development:
```bash
git checkout -b feature/module-name-description
# Make changes
git add .
git commit -m "feat(module-name): Add description of change"
git push origin feature/module-name-description
# Create pull request
```

### **Commit Message Format**

Follow Conventional Commits standard:
```
type(scope): Brief description

- Detailed change 1
- Detailed change 2
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
**Scope:** Module name or component affected

**Examples:**
```
feat(auth): Add JWT token validation
fix(database): Correct connection pooling issue
docs(api): Update endpoint documentation
test(user-service): Add integration tests
```

### **Before Committing**

Always run quality checks:
```bash
# Run linter
npm run lint          # or equivalent for your stack

# Run tests
npm test             # or equivalent for your stack

# Fix issues before committing
```

## **5. Work Item Management**

### **Creating Work Items**

For any non-trivial work, create a work item in `docs/work-items/`:
```bash
# Create new work item
touch docs/work-items/WI-XXX-description.md
```

Work items should include:
- **Description** - What needs to be done
- **Module** - Which module is affected
- **Acceptance Criteria** - How to verify completion
- **Dependencies** - Prerequisites
- **Status** - To Do, In Progress, Done

### **Tracking Progress**

Update work item status as you progress:
- Move from "To Do" to "In Progress" when starting
- Add notes about decisions and blockers
- Mark "Done" when acceptance criteria met
- Reference work items in commit messages

## **6. Architecture Decision Records (ADRs)**

For significant architectural decisions, create an ADR in `docs/adr/`:

**When to create an ADR:**
- Choosing between technology alternatives
- Defining a new architectural pattern
- Making security or performance tradeoffs
- Changing existing architectural decisions

**ADR Format:**
```markdown
# ADR-XXX: [Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated
**Decision Makers:** [Names]

## Context
[What is the issue we're addressing?]

## Decision
[What did we decide?]

## Rationale
[Why did we make this decision?]

## Consequences
[What are the positive and negative outcomes?]
```

## **7. Testing Strategy**

### **Test Types**

Implement tests according to the module specification:
- **Unit Tests** - Test individual functions/classes in isolation
- **Integration Tests** - Test module interactions
- **End-to-End Tests** - Test complete user workflows (if specified)

### **Test Coverage**

Aim for high test coverage as defined in module specs:
- Critical business logic: 100% coverage
- Standard functionality: 80%+ coverage
- UI/Presentation layer: As specified in requirements

### **Running Tests**

```bash
# Run all tests
npm test

# Run specific module tests
npm test -- modules/[module-name]

# Run with coverage
npm test -- --coverage
```

## **8. Documentation Practices**

### **What to Document**

- **Public APIs** - All exported functions, classes, interfaces
- **Module README** - Purpose, usage, dependencies
- **Complex Logic** - Non-obvious algorithms or business rules
- **Configuration** - Environment variables, settings
- **Deployment** - How to deploy and run the application

### **Documentation Style**

Follow these guidelines:
- Use clear, concise language
- Provide code examples for APIs
- Document parameters, return values, and exceptions
- Keep documentation close to the code it describes
- Update docs when code changes

## **9. Common Development Tasks**

### **Adding a New Module**

1. Create module directory: `mkdir -p modules/[module-name]/{src,tests,docs}`
2. Create module spec: `modules/[module-name]/spec.yaml`
3. Register in manifest: Update `moduleRegistry` in `project-manifest.yaml`
4. Implement following the spec
5. Add tests per test strategy
6. Document in module README

### **Modifying an Existing Module**

1. Read current module spec
2. Determine if changes require spec update
3. If spec changes, document rationale (consider ADR)
4. Implement changes following coding standards
5. Update tests to cover new functionality
6. Update documentation
7. Run full test suite

### **Adding a Dependency**

1. Evaluate necessity (can we avoid it?)
2. Check license compatibility
3. Add to project's dependency file (package.json, requirements.txt, etc.)
4. Document why the dependency was added
5. Update relevant module specs
6. Pin to specific version

### **Debugging Issues**

1. Check module specification - are we meeting requirements?
2. Review recent changes - what changed when bug appeared?
3. Check logs and error messages
4. Write a failing test that reproduces the bug
5. Fix the code to make the test pass
6. Verify no regressions with full test suite

## **10. Quality Checklist**

Before marking any work as complete:

**Code Quality:**
- [ ] Follows coding standards in `docs/standards/coding_standards.md`
- [ ] No linting errors or warnings
- [ ] All tests pass
- [ ] Code reviewed (self-review or peer review)
- [ ] No hardcoded secrets or sensitive data

**Documentation:**
- [ ] Public APIs documented
- [ ] Module README updated if needed
- [ ] Inline comments for complex logic
- [ ] ADR created for architectural decisions

**Testing:**
- [ ] Unit tests written and passing
- [ ] Integration tests if specified
- [ ] Test coverage meets requirements
- [ ] Edge cases and error handling tested

**Git:**
- [ ] Meaningful commit messages
- [ ] Branch name follows convention
- [ ] No merge conflicts
- [ ] Pull request description explains changes

## **11. Getting Help**

### **Resources**

- **Project Manifest:** `project-manifest.yaml` - Overview of all modules and requirements
- **Requirements:** `docs/requirements/` - What the system must do
- **Coding Standards:** `docs/standards/coding_standards.md` - How to write code
- **Module Specs:** `modules/[module-name]/spec.yaml` - Module-specific guidance
- **ADRs:** `docs/adr/` - Historical architectural decisions

### **Common Questions**

**Q: Where do I start?**
A: Read `project-manifest.yaml` and `README.md` first, then review the requirements in `docs/requirements/`.

**Q: Which module should I work on?**
A: Check `project-manifest.yaml` moduleRegistry for module status. Choose "To Do" modules or check `docs/work-items/` for tasks.

**Q: How do I know what to implement?**
A: Read the module specification in `modules/[module-name]/spec.yaml`. It defines all requirements.

**Q: What coding style should I use?**
A: Follow `docs/standards/coding_standards.md` which was generated for this project's tech stack.

**Q: How much testing is required?**
A: Check the module spec's "testStrategy" section for specific requirements.

## **12. MAIA Framework Philosophy**

This project follows the MAIA framework philosophy:
- **Specification-Driven:** Specs define what to build before building it
- **Quality-First:** Testing and linting are not optional
- **Modular:** Components are independent and well-bounded
- **Documented:** Code and decisions are clearly explained
- **Iterative:** Modules are built and refined incrementally

Remember: The goal is not just working code, but maintainable, tested, documented code that solves real user needs.

---

**Note to AI Agents:** This document guides your work on {{PROJECT_NAME}}. When in doubt, refer to the specifications and requirements. Quality over speed. Complete implementation over partial features.
