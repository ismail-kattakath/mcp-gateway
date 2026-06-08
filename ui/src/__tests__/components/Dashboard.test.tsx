import { describe, it, expect } from 'vitest';
import Dashboard from '../../components/Dashboard';

describe('Dashboard', () => {
  it('imports successfully', () => {
    expect(Dashboard).toBeDefined();
    expect(typeof Dashboard).toBe('function');
  });

  it('is a React component', () => {
    expect(Dashboard.name).toBe('Dashboard');
  });
});
