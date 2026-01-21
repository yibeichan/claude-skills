# Maintainer's Guide

## Adding a New Skill

### Option 1: Use the helper script (recommended)

```bash
npm run add
```

This will:
- Create the skill directory structure
- Generate template files
- Update `skills.json` automatically

### Option 2: Manual setup

1. Create the skill directory:
   ```bash
   mkdir -p skills/my-skill/{references,assets}
   ```

2. Create `SKILL.md` with proper frontmatter:
   ```markdown
   ---
   name: my-skill
   description: Clear description with trigger keywords
   ---

   # My Skill

   [Content here - keep under 500 lines]
   ```

3. Add entry to `skills.json`:
   ```json
   {
     "name": "my-skill",
     "version": "1.0.0",
     "description": "Description with trigger keywords",
     "path": "skills/my-skill",
     "author": "Your Name",
     "tags": ["tag1", "tag2"],
     "dependencies": []
   }
   ```

4. Update `README.md` to include the new skill in the "Available Skills" section

5. Update version in `package.json` (and optionally tag a release)

## Updating an Existing Skill

1. Edit the skill files in `skills/skill-name/`
2. If changing functionality significantly:
   - Update the `version` in `skills.json`
   - Update version in `package.json`
3. Commit and push

## Publishing to npm

1. Update version in `package.json`:
   ```bash
   npm version patch  # or minor, major
   ```

2. Publish (scoped packages need public access):
   ```bash
   npm publish --access public
   ```

3. Create a git tag:
   ```bash
   git push origin --tags
   ```

## Version Management

- **Major** (1.0.0 → 2.0.0): Breaking changes to skill structure
- **Minor** (1.0.0 → 1.1.0): New features, new references
- **Patch** (1.0.0 → 1.0.1): Bug fixes, clarifications

Keep `package.json` and `skills.json` versions in sync.
