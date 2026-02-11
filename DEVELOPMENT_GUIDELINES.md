# LLREM Development Guidelines

## 🎯 North Star Principle
LLREM is building toward a future where AI coding assistants continuously improve themselves. Every decision should align with this vision of automated, data-driven optimization.

## 📋 Pre-Development Checklist

### 1. Set Up Development Environment
```bash
# Install dependencies
pnpm install

# Set up pre-commit hooks
pnpm husky install

# Verify Claude Code is accessible
claude --version

# Locate Claude Code data directory
ls ~/.claude/
```

### 2. Understand Claude Code's Data Structure
Before implementing, investigate:
- [ ] Location of transcript files (`~/.claude/conversations/`?)
- [ ] Format of conversation logs (JSON, plain text, structured?)
- [ ] Config file locations and schemas
- [ ] Available hooks and integration points
- [ ] MCP server configurations

## 🚀 Quick Start Implementation Path

### Week 1: Foundation
1. **Create basic CLI structure** using Oclif
2. **Implement TranscriptParser** for Claude Code logs
3. **Write HeuristicAnalyzer** for UI pattern detection
4. **Build simple text output** of findings

### Week 2: Core Value
1. **Implement MCPCatalog** with Playwright as first entry
2. **Create ConfigWriter** for safe JSON modifications
3. **Add DiffGenerator** for preview
4. **Test with real transcripts**

### Week 3: Polish
1. **Add Ink-based UI** for better presentation
2. **Implement --since flag** for time filtering
3. **Add --apply functionality**
4. **Write comprehensive tests**

## 🏗️ Architecture Decisions

### Use Composition Over Inheritance
```typescript
// Good: Composable analyzers
const analyzer = compose(
  heuristicAnalyzer,
  llmAnalyzer,
  aggregator
);

// Avoid: Deep inheritance chains
class AdvancedAnalyzer extends BaseAnalyzer extends AbstractAnalyzer {}
```

### Fail Gracefully, Never Crash
```typescript
// Always wrap risky operations
try {
  const transcripts = await parseTranscripts(dir);
} catch (error) {
  logger.warn(`Skipping malformed transcript: ${error.message}`);
  continue; // Don't stop the analysis
}
```

### Make Everything Testable
```typescript
// Inject dependencies for testing
export function createAnalyzer(
  parser: TranscriptParser = defaultParser,
  llm: LLMClient = defaultLLM
) {
  return new Analyzer(parser, llm);
}
```

## 📊 Success Metrics

Track these to validate LLREM's impact:
1. **Reduction in repeated errors** (measure across sessions)
2. **Time saved per session** (fewer manual corrections)
3. **Adoption of suggestions** (acceptance rate)
4. **User satisfaction** (GitHub stars, feedback)

## 🔄 Iteration Strategy

### Start Narrow, Expand Gradually
1. **v0.2.0**: Solve UI verification problem perfectly
2. **v0.3.0**: Add test automation patterns
3. **v0.4.0**: Introduce LLM analysis
4. **v0.5.0**: Support multiple CLI agents

### Dogfood Religiously
- Run LLREM on your own Claude Code sessions daily
- Fix the issues you personally encounter first
- Share findings with early adopters

## 🚨 Common Pitfalls to Avoid

### Don't Over-Engineer Early
- ❌ Building a plugin system before core works
- ✅ Hardcode patterns, extract abstractions later

### Don't Assume Config Formats
- ❌ Guessing Claude Code's schema
- ✅ Inspect actual files, handle variations

### Don't Overwhelm Users
- ❌ Showing 20 suggestions at once
- ✅ Top 3 high-impact fixes only

## 🧪 Testing Strategy

### Sample Transcript Library
Create `test/fixtures/transcripts/` with:
- `ui-struggles.json` - Multiple UI verification failures
- `test-failures.json` - Missed test errors
- `context-loss.json` - Large file handling issues
- `happy-path.json` - No issues (ensure no false positives)

### Integration Test Harness
```typescript
describe('End-to-end flow', () => {
  it('detects UI issues and suggests Playwright', async () => {
    const result = await llrem.analyze('./fixtures/ui-struggles.json');
    expect(result.suggestions[0].mcp).toBe('playwright');
    
    const diff = await llrem.generateDiff(result.suggestions[0]);
    expect(diff).toContain('+  "mcpServers": [');
  });
});
```

## 📝 Documentation Standards

### Every Module Needs
1. **Purpose comment** - Why it exists
2. **Usage example** - How to use it
3. **Edge cases** - What could go wrong

### User-Facing Docs Must Include
1. **Before/After examples** - Show the impact
2. **Troubleshooting section** - Common issues
3. **Video demo** - Visual learners appreciate this

## 🎨 UI/UX Principles

### Terminal-Native, Not Terminal-Limited
- Use colors meaningfully (red=error, green=success, yellow=suggestion)
- Leverage box-drawing characters for structure
- Keep animations subtle (spinners, not flashy)

### Information Hierarchy
```
🔍 LLREM Analysis (7 sessions, 3 issues found)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  UI Verification Issues (4 occurrences)
    → Enable Playwright MCP for browser testing
    [Apply] [Details] [Skip]

📝 Test Automation Gap (2 occurrences)  
    → Add post-commit test hook
    [Apply] [Details] [Skip]
```

## 🔐 Security & Privacy

### Never Log Sensitive Data
- Scrub API keys, tokens, passwords from transcripts
- Hash user identifiers if tracking usage
- Offer local-only LLM option for analysis

### Safe File Operations
```typescript
// Always backup before modifying
const backup = `${configPath}.llrem-backup`;
await fs.copyFile(configPath, backup);

// Validate JSON before writing
const validated = ConfigSchema.parse(newConfig);
await fs.writeFile(configPath, JSON.stringify(validated, null, 2));
```

## 🚢 Release Checklist

### Before Publishing to NPM
- [ ] All tests passing
- [ ] Manual test on fresh machine
- [ ] README updated with new features
- [ ] CHANGELOG entry added
- [ ] Version bumped appropriately
- [ ] Security audit (`pnpm audit`)

## 💡 Innovation Opportunities

### Near-Term Experiments
- **Real-time analysis** via Claude Code hooks
- **Suggestion confidence scores** based on pattern frequency
- **A/B testing** different suggestions

### Long-Term Vision
- **Cross-agent learning** (share patterns between users)
- **Predictive suggestions** (before problems occur)
- **Custom analyzer marketplace** (community contributions)

## 📞 Getting Help

- **Technical questions**: Create detailed GitHub issues
- **Feature requests**: Open discussions first
- **Security issues**: Email directly, don't post publicly

Remember: LLREM's success is measured by how much friction it removes from AI-assisted coding. Every line of code should serve that mission.