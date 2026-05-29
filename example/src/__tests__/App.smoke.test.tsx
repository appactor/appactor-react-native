import { describe, expect, it } from '@jest/globals';

import App from '../App';

describe('example App smoke', () => {
  it('loads the example component without requiring generated lib output', () => {
    expect(typeof App).toBe('function');
  });
});
