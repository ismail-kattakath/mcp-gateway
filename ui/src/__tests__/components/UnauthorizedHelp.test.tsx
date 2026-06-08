import { describe, it, expect } from 'vitest';
import UnauthorizedHelp from '../../components/UnauthorizedHelp';

describe('UnauthorizedHelp', () => {
  it('imports successfully', () => {
    expect(UnauthorizedHelp).toBeDefined();
    expect(typeof UnauthorizedHelp).toBe('function');
  });

  it('is a React component', () => {
    expect(UnauthorizedHelp.name).toBe('UnauthorizedHelp');
  });
});
