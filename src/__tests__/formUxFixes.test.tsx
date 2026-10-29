import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../auth/AuthProvider';
import { LoginPage } from '../components/auth/LoginPage';
import { KeywordSearchForm } from '../components/KeywordSearchForm';
import { VideoUrlForm } from '../components/VideoUrlForm';

vi.mock('../config', () => ({
  CSRF_TOKEN: '',
  CSRF_HEADER_NAME: 'X-CSRF-Token',
  CONTACT_EMAIL: 'support@qfza.app',
  CONTACT_FORM_ENDPOINT: '',
  GOOGLE_CLIENT_ID: '',
}));

vi.mock('../hooks/useRoute', () => ({ navigate: vi.fn() }));

function jsonResponse(data: unknown, status = 200, ok = true): Response {
  return { ok, status, json: () => Promise.resolve(data) } as unknown as Response;
}

describe('landing URL form guidance', () => {
  it('explains the accepted source and the next step outside the search box', () => {
    const { container } = render(<VideoUrlForm onSubmit={vi.fn()} />);
    const form = container.querySelector('form');

    expect(
      screen.getByText(
        'Public YouTube or Google Drive video — not a channel, playlist, or Short.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Next, enter a word or phrase to search inside it.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try an example video' })).not.toBeInTheDocument();

    expect(form).not.toBeNull();
    expect(form).not.toHaveTextContent(
      'Public YouTube or Google Drive video — not a channel, playlist, or Short.',
    );
  });

  it('keeps the guidance out of the loaded-video workspace', () => {
    render(<VideoUrlForm compact onSubmit={vi.fn()} />);

    expect(
      screen.queryByText('Public YouTube or Google Drive video — not a channel or playlist.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try an example video' })).not.toBeInTheDocument();
  });
});

describe('keyword search disabled state', () => {
  it('shows why the field cannot be used and describes it', () => {
    render(
      <KeywordSearchForm
        onSubmit={vi.fn()}
        disabled
        disabledHint="The keyword search opens once a video is loaded."
      />,
    );

    const input = screen.getByLabelText('Search this video');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-describedby', 'video-keyword-disabled-hint');
    expect(
      screen.getByText('The keyword search opens once a video is loaded.'),
    ).toBeInTheDocument();
  });

  it('marks an empty submit with text and an alert icon', async () => {
    const user = userEvent.setup();
    render(<KeywordSearchForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Search' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Please enter a word or phrase.');
    expect(alert.querySelector('svg')).not.toBeNull();
    expect(screen.getByLabelText('Search this video')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('login form validation and password reveal', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ user: null }, 401, false));
    vi.stubGlobal('fetch', fetchMock);
  });

  async function renderLogin() {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();
  }

  it('reports empty fields inline without a server round trip', async () => {
    const user = userEvent.setup();
    await renderLogin();

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('can reveal and re-hide a password', async () => {
    const user = userEvent.setup();
    await renderLogin();

    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
