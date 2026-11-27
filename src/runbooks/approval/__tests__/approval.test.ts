import { describe, expect, it } from 'vitest';
import { definition, fixture, target } from '../../__tests__/fixture.js';

describe('persisted owner approval', () => {
  it.each([
    [definition, { ...target, subjectId: 'different' }],
    [definition, { ...target, incidentId: 'different' }],
    [definition, { ...target, tenantId: 'different' }],
    [{ ...definition, action: 'other' }, target],
    [{ ...definition, revision: '2' }, target],
    [{ ...definition, guidanceKey: 'different' }, target],
  ] as const)('rejects an approval restored against a changed binding', async (book, subject) => {
    const f = fixture();
    const checkpoint = await f.pause();
    await expect(f.executor(book, subject).resume(checkpoint, 'approve')).rejects.toThrow();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.other).not.toHaveBeenCalled();
  });
});
