import { describe, it, expect, afterEach } from 'vitest';
import { Klira } from '../index.js';

describe('Klira.init() & pipeline', () => {
  afterEach(async () => {
    await Klira.shutdown();
  });

  it('initializes and returns frozen config', async () => {
    const config = await Klira.init({
      appName: 'test-app',
      apiKey: 'klira_test_key',
      tracingEnabled: false,
    });

    expect(config.appName).toBe('test-app');
    expect(Object.isFrozen(config)).toBe(true);
    expect(Klira.isInitialized()).toBe(true);
  });

  it('returns same config on double init', async () => {
    const config1 = await Klira.init({
      appName: 'test-app',
      tracingEnabled: false,
    });
    const config2 = await Klira.init({
      appName: 'other-app',
      tracingEnabled: false,
    });
    expect(config1).toBe(config2);
  });

  it('getConfig throws before init', () => {
    expect(() => Klira.getConfig()).toThrow('not initialized');
  });

  it('shutdown resets state', async () => {
    await Klira.init({ appName: 'test-app', tracingEnabled: false });
    expect(Klira.isInitialized()).toBe(true);

    await Klira.shutdown();
    expect(Klira.isInitialized()).toBe(false);
    expect(() => Klira.getConfig()).toThrow();
  });

  it('rejects invalid config', async () => {
    await expect(
      Klira.init({ appName: 'test-app', apiKey: 'bad_key', tracingEnabled: false }),
    ).rejects.toThrow('klira_');
  });

  it('config immutability prevents mutation', async () => {
    const config = await Klira.init({
      appName: 'test-app',
      tracingEnabled: false,
    });

    expect(() => {
      (config as any).appName = 'hacked';
    }).toThrow();
  });
});
