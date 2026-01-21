#!/usr/bin/env node

/**
 * Add a new skill to the repository
 * Creates the skill directory structure and updates skills.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function getInput(prompt, defaultValue = '') {
  const response = await question(`${prompt}${defaultValue ? ` [${defaultValue}]` : ''}: `);
  return response || defaultValue;
}

function kebabCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

function titleCase(str) {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function createSkill() {
  console.log('\x1b[36mCreate a new Claude skill\x1b[0m\n');

  // Gather information
  const name = await getInput('Skill name (kebab-case, e.g., "my-skill")');
  if (!name) {
    console.log('\x1b[31mError: Skill name is required\x1b[0m');
    rl.close();
    return;
  }

  const displayName = await getInput('Display name', titleCase(name));
  const description = await getInput('Description (include trigger keywords)');
  const author = await getInput('Author', 'Yibei Chen');
  const tagsInput = await getInput('Tags (comma-separated)', '');
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];

  // Create skill directory structure
  const skillPath = path.join(REPO_ROOT, 'skills', name);

  if (fs.existsSync(skillPath)) {
    const overwrite = await question(`Skill directory "${name}" already exists. Overwrite? [y/N]: `);
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      rl.close();
      return;
    }
    fs.rmSync(skillPath, { recursive: true, force: true });
  }

  // Create directories
  fs.mkdirSync(skillPath, { recursive: true });
  fs.mkdirSync(path.join(skillPath, 'references'), { recursive: true });
  fs.mkdirSync(path.join(skillPath, 'assets'), { recursive: true });

  // Create SKILL.md template
  const skillTemplate = `---
name: ${name}
description: ${description}
---

# ${displayName}

[Provide a brief overview of what this skill does]

## When to Use This Skill

- [Specific use case 1]
- [Specific use case 2]
- [Specific use case 3]

## Core Instructions

[Step-by-step guidance for the skill]

## Examples

### Example 1: [Concrete scenario]

[Code or detailed example]

### Example 2: [Another scenario]

[Code or detailed example]

## Guidelines

- Guideline 1
- Guideline 2
- Guideline 3

## Common Pitfalls

- **Pitfall 1**: [Description and how to avoid it]
- **Pitfall 2**: [Description and how to avoid it]

## References

For extended documentation, see:
- \`references/example.md\` - [Brief description of what it contains]
`;

  fs.writeFileSync(path.join(skillPath, 'SKILL.md'), skillTemplate);

  // Create a placeholder reference file
  const refTemplate = `# Additional Documentation

This file contains extended documentation for the ${displayName} skill.

## Table of Contents

- [Detailed Topic 1](#detailed-topic-1)
- [Detailed Topic 2](#detailed-topic-2)

## Detailed Topic 1

[Comprehensive details that would make SKILL.md too long]

## Detailed Topic 2

[More comprehensive details]
`;

  fs.writeFileSync(
    path.join(skillPath, 'references', 'example.md'),
    refTemplate
  );

  // Update skills.json
  const manifestPath = path.join(REPO_ROOT, 'skills.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const newSkill = {
    name,
    version: '1.0.0',
    description,
    path: `skills/${name}`,
    author,
    tags,
    dependencies: []
  };

  manifest.skills.push(newSkill);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('\n\x1b[32m✓ Skill created successfully!\x1b[0m\n');
  console.log(`Created files:`);
  console.log(`  ${path.join(skillPath, 'SKILL.md')}`);
  console.log(`  ${path.join(skillPath, 'references', 'example.md')}`);
  console.log(`  ${path.join(skillPath, 'assets', '/')}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit ${path.join(skillPath, 'SKILL.md')} to add your skill content`);
  console.log(`  2. Add detailed docs to ${path.join(skillPath, 'references/')}`);
  console.log(`  3. Update ${path.join(skillPath, 'README.md')} in the main repo to include your skill`);
  console.log(`  4. Commit and push your changes\n`);

  rl.close();
}

createSkill();
