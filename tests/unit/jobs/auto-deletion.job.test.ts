import { runAutoDeletionNow, startAutoDeletionJob } from '../../../src/jobs/auto-deletion.job';

jest.mock('../../../src/services/deletion.service', () => ({
  deletionService: { autoDeleteExpiredDocuments: jest.fn() }
}));

// node-cron mock: call the handler immediately to exercise the cron callback
jest.mock('node-cron', () => ({
  schedule: jest.fn((expr: string, fn: () => void) => {
    // call the scheduled function to simulate a tick
    fn();
    return { stop: jest.fn() };
  })
}));

const { deletionService } = jest.requireMock('../../../src/services/deletion.service') as unknown as {
  deletionService: { autoDeleteExpiredDocuments: jest.Mock };
};
const cron = jest.requireMock('node-cron') as unknown as { schedule: jest.Mock };

describe('auto-deletion.job', (): void => {
  beforeEach((): void => {
    jest.clearAllMocks();
    delete process.env.AUTO_DELETE_CRON;
  });

  it('runAutoDeletionNow returns deleted count when service resolves', async (): Promise<void> => {
    (deletionService.autoDeleteExpiredDocuments as jest.Mock).mockResolvedValue(5);

    const count = await runAutoDeletionNow();
    expect(count).toBe(5);
    expect(deletionService.autoDeleteExpiredDocuments).toHaveBeenCalled();
  });

  it('runAutoDeletionNow propagates errors from deletionService', async (): Promise<void> => {
    (deletionService.autoDeleteExpiredDocuments as jest.Mock).mockRejectedValue(new Error('DB error'));
    await expect(runAutoDeletionNow()).rejects.toThrow('DB error');
  });

  it('startAutoDeletionJob schedules cron with default expression when env not set', (): void => {
    startAutoDeletionJob();
    expect(cron.schedule).toHaveBeenCalled();
    const callArg = (cron.schedule.mock.calls[0][0]) as string;
    expect(typeof callArg).toBe('string');
  });

  it('startAutoDeletionJob uses AUTO_DELETE_CRON env when provided', (): void => {
    process.env.AUTO_DELETE_CRON = '*/5 * * * *';
    startAutoDeletionJob();
    expect(cron.schedule).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function));
  });

  it('startAutoDeletionJob logs scheduling message (warn)', (): void => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.AUTO_DELETE_CRON = '0 3 * * *';

    startAutoDeletionJob();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Auto-deletion cron job scheduled'));
    warnSpy.mockRestore();
  });
});
