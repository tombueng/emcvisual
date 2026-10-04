import { describe, expect, it } from 'vitest';
import { findingSeverity, severityColor, sourceSeverity } from '../src/physics/severity';

describe('severity of findings', () => {
  it('is red when the source is at the limit and the finding causes much of it', () => {
    expect(findingSeverity(-0.2, 11, 'ref-change').level).toBe('critical');
    // the same source, a finding that hardly matters: worth a look, not critical
    expect(findingSeverity(-0.2, 0.9, 'return-gap').level).toBe('check');
    // a big cause on a quiet source is not urgent
    expect(findingSeverity(-25, 30, 'return-gap').level).toBe('minor');
    expect(sourceSeverity(3).score).toBe(1);
    expect(sourceSeverity(-45).level).toBe('minor');
  });

  it('goes from green over yellow to red', () => {
    expect(severityColor(0)).toBe('hsl(120 78% 52%)');
    expect(severityColor(0.5)).toBe('hsl(60 78% 52%)');
    expect(severityColor(1)).toBe('hsl(0 78% 52%)');
  });
});
