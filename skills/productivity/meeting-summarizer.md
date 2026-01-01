# Meeting Summarizer Skill

## Description
A skill for converting meeting notes or transcripts into clear, actionable summaries with key decisions and action items.

## Purpose
Save time and improve team communication by quickly distilling meeting discussions into essential information.

## Usage

### Prompt Template
```
Summarize the following meeting notes:

Meeting: [Meeting title/purpose]
Date: [Optional]
Attendees: [Optional]

[Insert meeting notes or transcript]

Please provide:
- Executive summary
- Key decisions made
- Action items with owners (if mentioned)
- Important discussion points
- Next steps
```

## Example

**Input:**
```
Team discussed Q1 roadmap. Sarah proposed new feature X. Team agreed to prototype.
John raised concerns about timeline. Decided to review again in 2 weeks.
Mike to create design mockups by Friday.
```

**Expected Output:**
**Summary:**
- Proposal for feature X approved for prototyping
- Timeline concerns noted, follow-up scheduled

**Decisions:**
- Proceed with feature X prototype
- Review meeting in 2 weeks

**Action Items:**
- Mike: Create design mockups (Due: Friday)
- Team: Prepare for 2-week review

## Best Practices
- Include as much context as possible
- Mention attendee names for action item assignment
- Note any deadlines or time constraints
- Specify the level of detail needed

## Related Skills
- More productivity skills will be added to complement this one
