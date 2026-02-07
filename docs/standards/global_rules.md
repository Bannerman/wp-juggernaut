# **MAIA Global Rules**

**Version: 1.0**

This document contains the set of global, non-negotiable rules for all projects developed using the MAIA framework. AI agents MUST adhere to these rules at all times. Project-specific rules (.windsurfrules.md) can add to but cannot override these core principles without explicit permission.

### **1\. Commit Message Standards**

**Purpose:** To ensure a clean, understandable, and automated-friendly version control history.

* **Rule 1.1: Conventional Commits:** All commit messages MUST follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.  
  * **Format:** \<type\>\[optional scope\]: \<description\>  
  * **Example:** feat(auth): add password reset endpoint  
  * **Common Types:** feat, fix, build, chore, ci, docs, style, refactor, perf, test.

### **2\. Security Policies**

**Purpose:** To establish a baseline of secure coding practices and prevent common vulnerabilities.

* **Rule 2.1: No Hardcoded Secrets:** No API keys, passwords, tokens, or other secrets are ever to be hardcoded in the source code. They MUST be loaded from environment variables or a secure secret management service.  
* **Rule 2.2: Input Validation:** All external input (from users, APIs, etc.) MUST be validated and sanitized on the server-side to prevent injection attacks (SQLi, XSS, etc.).  
* **Rule 2.3: Principle of Least Privilege:** Code should only be granted the permissions necessary to perform its function.

### **3\. Code Style & Readability**

**Purpose:** To ensure all generated code is maintainable, readable, and consistent.

* **Rule 3.1: English Language:** All comments, variable names, and function names MUST be in English.  
* **Rule 3.2: Comprehensive Comments:** Public functions and complex logic blocks MUST have clear comments explaining their purpose, parameters, and return values.  
* **Rule 3.3: No Magic Numbers:** Un-obvious, unnamed numbers in the code should be replaced with named constants.  
* **Rule 3.4: Linter Adherence:** All code must pass the linter checks defined in the project-specific workflow (e.g., ESLint, Flake8).

### **4\. Dependency Management**

**Purpose:** To maintain a secure and stable software supply chain.

* **Rule 4.1: License Vetting:** Do not use dependencies with restrictive or incompatible licenses (e.g., GPL in a proprietary project) without explicit approval documented in an ADR.  
* **Rule 4.2: Dependency Pinning:** All project dependencies MUST be pinned to specific versions in a dependency file (e.g., package-lock.json, requirements.txt) to ensure reproducible builds.

### **5\. Documentation**

**Purpose:** To ensure the project is understandable and usable by others.

* **Rule 5.1: README Generation:** Every module or microservice MUST contain a README.md file explaining its purpose, how to install it, and how to run it.

### **6\. Versioning Policy**

**Purpose:** To ensure a consistent and predictable versioning scheme.

* **Rule 6.1: Semantic Versioning:** This project adheres to Semantic Versioning 2.0.0. All version numbers MUST follow the MAJOR.MINOR.PATCH format.
* **Rule 6.2: Breaking Changes:** All breaking changes MUST result in a MAJOR version increment. A detailed explanation of what constitutes a breaking change can be found in the [MAIA Toolkit Versioning Policy](./versioning_policy.md).