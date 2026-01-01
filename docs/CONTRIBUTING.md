# Contributing Guide

Thank you for your interest in contributing to the Claude Skills collection! This guide will help you add your own skills to the repository.

## How to Contribute

### Adding a New Skill

1. **Choose the right category** for your skill:
   - `skills/coding/` - Programming and development skills
   - `skills/writing/` - Content creation and writing skills
   - `skills/analysis/` - Data analysis and research skills
   - `skills/productivity/` - Task management and productivity skills

2. **Use the skill template** from [`docs/skill-template.md`](skill-template.md)

3. **Create your skill file**:
   ```bash
   # Use kebab-case for file names
   skills/category/your-skill-name.md
   ```

4. **Write clear documentation** including:
   - Description and purpose
   - Usage instructions with prompt template
   - Practical examples
   - Best practices
   - Related skills (if any)

5. **Update the catalog**:
   - Add your skill to [`CATALOG.md`](../CATALOG.md)
   - Include category, description, and tags
   - Update the tag index if you introduce new tags

6. **(Optional) Add an example**:
   - Create a practical example in `examples/`
   - Show real-world usage of your skill
   - Include expected outcomes

### Quality Guidelines

#### Skill Documentation Should:
- ✅ Have a clear, specific purpose
- ✅ Include a reusable prompt template
- ✅ Provide concrete examples
- ✅ List best practices for effective use
- ✅ Be well-formatted and easy to read

#### Avoid:
- ❌ Overly broad or vague skills
- ❌ Skills that duplicate existing ones
- ❌ Incomplete or unclear documentation
- ❌ Skills that require external tools not available to Claude

### Submission Process

1. **Fork the repository**
2. **Create a new branch**:
   ```bash
   git checkout -b add-skill-your-skill-name
   ```
3. **Make your changes**:
   - Add your skill file
   - Update CATALOG.md
   - (Optional) Add example
4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Add [Skill Name] skill"
   ```
5. **Push to your fork**:
   ```bash
   git push origin add-skill-your-skill-name
   ```
6. **Open a Pull Request**:
   - Describe what your skill does
   - Explain why it's useful
   - Link to any related issues

## Skill Categories

### When to Create a New Category

Only create a new category if:
- Your skill doesn't fit any existing categories
- You're adding multiple related skills that form a cohesive group
- The category represents a significant use case

If creating a new category:
1. Create the directory: `skills/new-category/`
2. Update the README.md structure section
3. Update CATALOG.md with the new section
4. Add at least 2-3 skills to justify the category

## Code of Conduct

- Be respectful and constructive
- Focus on skill quality and usefulness
- Help improve existing skills through feedback
- Keep skills appropriate and professional

## Questions?

Open an issue if you have questions about:
- Whether your skill fits the collection
- How to structure a complex skill
- Technical aspects of the contribution process

Thank you for contributing to make Claude more capable!
