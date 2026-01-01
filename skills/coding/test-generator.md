# Test Generator Skill

## Description
A skill for generating comprehensive unit tests and test cases for various programming languages.

## Purpose
Accelerate test-driven development by automatically generating test cases based on code functions and requirements.

## Usage

### Prompt Template
```
Generate unit tests for the following code:

Language: [Programming Language]
Testing Framework: [e.g., Jest, pytest, JUnit]

[Insert code here]

Please include:
- Happy path tests
- Edge cases
- Error handling tests
- Mock data where needed
```

## Example

**Input:**
```javascript
function calculateDiscount(price, discountPercent) {
    return price - (price * discountPercent / 100);
}
```

**Expected Output:**
Complete test suite with:
- Valid discount calculations
- Zero discount test
- 100% discount test
- Negative values handling
- Invalid input tests

## Best Practices
- Specify the testing framework you're using
- Mention code coverage requirements
- Include any specific test scenarios you want covered
- Provide context about the function's purpose

## Related Skills
- `code-reviewer.md` - For reviewing generated tests
- `mocking-assistant.md` - For complex mock object creation
