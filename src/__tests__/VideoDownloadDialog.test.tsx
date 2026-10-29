import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoDownloadDialog } from '../components/VideoDownloadDialog';
import { fetchVideoFormats } from '../api/client';

vi.mock('../api/client', () => ({
  fetchVideoFormats: vi.fn(),
}));

const formatsMock = vi.mocked(fetchVideoFormats);

/** Render the dialog with both callbacks spied on. */
function setup(initialStart?: string, showQuality = true) {
  const onClose = vi.fn();
  const onDownload = vi.fn();
  const view = render(
    <VideoDownloadDialog
      videoId="abcdef12345"
      showQuality={showQuality}
      initialStart={initialStart}
      onClose={onClose}
      onDownload={onDownload}
    />,
  );
  return { onClose, onDownload, view };
}

function fields() {
  return {
    start: screen.getByLabelText('Start (mm:ss)'),
    end: screen.getByLabelText('End (mm:ss)'),
  };
}

function downloadButton() {
  return screen.getByRole('button', { name: 'Download' });
}

describe('VideoDownloadDialog', () => {
  beforeEach(() => {
    formatsMock.mockReset();
    formatsMock.mockResolvedValue([]);
  });

  it('downloads the whole video when both fields are left empty', async () => {
    const user = userEvent.setup();
    const { onDownload } = setup();

    await user.click(downloadButton());

    expect(onDownload).toHaveBeenCalledWith(null, null, null);
  });

  it('turns mm:ss fields into seconds', async () => {
    const user = userEvent.setup();
    const { onDownload } = setup();
    const { start, end } = fields();

    await user.type(start, '0:30');
    await user.type(end, '1:15');
    await user.click(downloadButton());

    expect(onDownload).toHaveBeenCalledWith(30, 75, null);
  });

  it('leaves the end open when only a start is given', async () => {
    const user = userEvent.setup();
    const { onDownload } = setup();

    await user.type(fields().start, '1:30');
    await user.click(downloadButton());

    expect(onDownload).toHaveBeenCalledWith(90, null, null);
  });

  it('pre-fills and locks the start field when one is given', () => {
    setup('01:15');

    expect(fields().start).toHaveValue('01:15');
    expect(fields().start).toBeDisabled();
    expect(fields().end).toBeEnabled();
  });

  it('keeps the start field editable when the dialog was opened without a moment', () => {
    setup();

    expect(fields().start).toBeEnabled();
  });

  it('offers the probed qualities, tallest first, next to the best stream', async () => {
    formatsMock.mockResolvedValue([1080, 720, 360]);
    setup();

    const quality = screen.getByLabelText('Quality');
    await waitFor(() => expect(screen.getByRole('option', { name: '1080p' })).toBeInTheDocument());
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Choose quality', '1080p', '720p', '360p']);
    expect(quality).toBeEnabled();
  });

  it('hides the quality field and skips probing for non-YouTube videos', () => {
    setup(undefined, false);

    expect(screen.queryByLabelText('Quality')).not.toBeInTheDocument();
    expect(formatsMock).not.toHaveBeenCalled();
  });

  it('sends the chosen quality with the range', async () => {
    const user = userEvent.setup();
    formatsMock.mockResolvedValue([1080, 720]);
    const { onDownload } = setup();

    await user.type(fields().start, '0:30');
    await screen.findByRole('option', { name: '720p' });
    await user.selectOptions(screen.getByLabelText('Quality'), '720');
    await user.click(downloadButton());

    expect(onDownload).toHaveBeenCalledWith(30, null, 720);
  });

  it('falls back to the best stream while the qualities load and when they fail', async () => {
    formatsMock.mockRejectedValue(new Error('probe failed'));
    setup();

    const quality = screen.getByLabelText('Quality');
    expect(quality).toBeDisabled();

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Choose quality' })).toBeInTheDocument(),
    );
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Choose quality']);
  });

  it('refuses an end without a start', async () => {
    const user = userEvent.setup();
    const { onDownload } = setup();

    await user.type(fields().end, '1:00');
    await user.click(downloadButton());

    expect(onDownload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a start time first.');
  });

  it('refuses an end that does not come after the start', async () => {
    const user = userEvent.setup();
    const { onDownload } = setup();
    const { start, end } = fields();

    await user.type(start, '1:00');
    await user.type(end, '0:30');
    await user.click(downloadButton());

    expect(onDownload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('The end must come after the start.');
  });

  it('refuses a time it cannot read', async () => {
    const user = userEvent.setup();
    const { onDownload } = setup();

    await user.type(fields().start, 'abc');
    await user.click(downloadButton());

    expect(onDownload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid time like 1:30.');
  });

  it('does not scold a half-typed time before it is submitted', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(fields().start, '1:');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes on cancel', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { onClose, view } = setup();

    fireEvent.keyDown(view.container.querySelector('input')!, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop click but not on a click inside the dialog', () => {
    const { onClose, view } = setup();

    fireEvent.click(screen.getByRole('heading', { name: 'Download video' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(view.container.firstChild!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
