# Code Reviewer Skill

## Description
A skill that enables Claude to perform thorough code reviews with a focus on best practices, security, and maintainability.

## Purpose
Help developers improve code quality by providing detailed, constructive feedback on code submissions.

## Usage

### Prompt Template
```
Please review the following code with attention to:
1. Code quality and best practices
2. Potential bugs or security issues
3. Performance considerations
4. Readability and maintainability
5. Suggestions for improvement

[Insert code here]
```

## Example

**Input:**
```python
def get_user(id):
    user = db.query("SELECT * FROM users WHERE id = " + id)
    return user
```

**Expected Output:**
Claude will identify:
- SQL injection vulnerability
- Lack of error handling
- Missing type hints
- Suggest using parameterized queries
- Recommend adding input validation

## Best Practices
- Provide complete code context when possible
- Specify the programming language
- Mention any specific concerns or areas of focus
- Include relevant parts of the codebase for better context

## Related Skills
- `security-auditor.md` - For security-focused reviews
- `refactoring-assistant.md` - For code improvement suggestions
