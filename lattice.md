
## Objective
Provide a way to describe complex software in a high-level way and anchor the source code to it. The description is a collection of markdown files (with Obsidian-inspired syntax extension) with which the user can define arbitrary concepts that must be represented or referenced in the source code, e.g. concepts, rules, business logic and constraints, high level tests, and low-level suggested implementation details and requirements.

## High-level Design
Every section with paragraphs in it defines a concept. For example, suppose a project has this file in `.lattice` directory named `tests.md`:

```markdown
# Tests

## Billing

### Cancelling a service mid-month should refund the user the remainding days

Here comes the detailed high-level test description
```

Then the agent can be instructed to provide a test for `[[Cancelling a service mid-month]]`. The agent can then locate the test description and write the actual source code for the test, marking it with an in-code comment like

```typescript
// @lat: [[Tests#Billing#Cancelling a service mid-month should refund the user the remainding days]]
describe("...", () => { ... });
```

Users of the system can define arbitrary concepts and agents will be instructed to create references in the source files to where concepts are declared with `@lat:` comments.

The actual power will come with the `lat` command line. Some subcommands:

1. `lat find "[concept]"` -- will perform a RAG search and output the matched lat section ids with relevant snippets of text
2. `lat expand "[prompt]"` -- will convert `[[..]]` references in text to locations and snippets pointing to the information in the `.lattice` markdown files. This will be used by coding agents to pre-process user prompts and enrich them with context.
3. `lat refs "[section]"` -- will find all sections that reference the specified section
4. `lat locate "[section]"` -- will fuzzy-search sections that match the passed patterns
5. `lat init` -- will initialize the `.lattice` directory with template files
6. `lat agents.md` -- will output the basic scaffolding for the agents file instructing agents how to use the `lat` command line tool.
7. `lat analyze` -- will find all references to lattice sections in the source code, identify sections that don't have references. Can be used to ensure 100% coverage when new features are implemented.

The idea is that a project can have `.lattice` directory with `.md` files in it, at the same level `.git` directory typically exists.
