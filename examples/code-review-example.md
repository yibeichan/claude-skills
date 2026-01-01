# Example: Using the Code Reviewer Skill

This example demonstrates how to use the Code Reviewer skill to improve code quality.

## Scenario
You have a Python function that handles user authentication and want Claude to review it for potential issues.

## Your Code
```python
def authenticate_user(username, password):
    query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'"
    result = db.execute(query)
    if result:
        return True
    return False
```

## How to Use the Skill

1. **Open Claude** in your preferred interface
2. **Copy the prompt** from [skills/coding/code-reviewer.md](../skills/coding/code-reviewer.md)
3. **Customize it** with your code:

```
Please review the following code with attention to:
1. Code quality and best practices
2. Potential bugs or security issues
3. Performance considerations
4. Readability and maintainability
5. Suggestions for improvement

Python code:
def authenticate_user(username, password):
    query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'"
    result = db.execute(query)
    if result:
        return True
    return False
```

## Expected Review Points

Claude will likely identify:

### Security Issues
- **SQL Injection vulnerability:** The code concatenates user input directly into SQL query
- **Plain text password:** Passwords should be hashed, not stored/compared in plain text

### Best Practices
- Missing type hints
- No input validation
- No error handling
- Direct database access (should use ORM or parameterized queries)

### Suggested Improvements
```python
from typing import Optional
import hashlib
from sqlalchemy import text

def authenticate_user(username: str, password: str) -> bool:
    """
    Authenticate a user with username and password.
    
    Args:
        username: The username to authenticate
        password: The password to verify
        
    Returns:
        True if authentication successful, False otherwise
    """
    if not username or not password:
        return False
    
    # Hash the password
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    # Use parameterized query to prevent SQL injection
    query = text("SELECT * FROM users WHERE username = :username AND password_hash = :password_hash")
    result = db.execute(query, {"username": username, "password_hash": password_hash})
    
    return result.rowcount > 0
```

## Key Takeaways

1. Always use parameterized queries to prevent SQL injection
2. Never store passwords in plain text - use hashing
3. Add type hints for better code documentation
4. Include input validation
5. Add docstrings to explain function behavior

## Next Steps

After getting Claude's review:
- Implement the suggested changes
- Add unit tests using the [Test Generator](../skills/coding/test-generator.md) skill
- Consider a security audit with additional security-focused prompts
