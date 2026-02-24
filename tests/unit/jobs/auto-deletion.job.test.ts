import { runAutoDeletionNow, startAutoDeletionJob } from '../../../src/jobs/auto-deletion.job';

jest.mock('../../../src/services/deletion.service', () => ({
  deletionService: {
    autoDeleteExpiredDocuments: jest.fn()
  }
}));

// avoid unused parameter names in mock to satisfy TS noUnusedLocals
jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }));

const { deletionService } = require('../../../src/services/deletion.service');
const cron = require('node-cron');

describe('auto-deletion job', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runAutoDeletionNow returns deleted count when service resolves', async () => {
    (deletionService.autoDeleteExpiredDocuments as jest.Mock).mockResolvedValue(5);

    const count = await runAutoDeletionNow();
    expect(count).toBe(5);
    expect(deletionService.autoDeleteExpiredDocuments).toHaveBeenCalled();
  });

  it('runAutoDeletionNow propagates errors from deletionService', async () => {
    (deletionService.autoDeleteExpiredDocuments as jest.Mock).mockRejectedValue(
      new Error('DB error')
    );

    await expect(runAutoDeletionNow()).rejects.toThrow('DB error');
  });

  it('startAutoDeletionJob schedules cron with default expression when env not set', () => {
    delete process.env.AUTO_DELETE_CRON;
    startAutoDeletionJob();

    expect(cron.schedule).toHaveBeenCalled();
    const callArg = (cron.schedule as jest.Mock).mock.calls[0][0];
    expect(typeof callArg).toBe('string');
  });

  it('startAutoDeletionJob uses AUTO_DELETE_CRON env when provided', () => {
    process.env.AUTO_DELETE_CRON = '*/5 * * * *';
    startAutoDeletionJob();

    expect(cron.schedule).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function));
  });

  it('startAutoDeletionJob logs scheduling message', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.AUTO_DELETE_CRON = '0 3 * * *';

    startAutoDeletionJob();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Auto-deletion cron job scheduled')
    );
    logSpy.mockRestore();
  });
});
