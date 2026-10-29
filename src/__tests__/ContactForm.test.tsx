import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactForm } from '../components/ContactForm';

vi.mock('../config', () => ({
  CONTACT_FORM_ENDPOINT: 'https://formspree.io/f/test',
  CONTACT_EMAIL: 'test@example.com',
}));

describe('ContactForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates required fields and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(screen.getByText('Please enter your name.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveFocus();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('validates the email format', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Sara');
    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'not-an-email');
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(screen.getByText(/doesn't look like a valid email/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your email' })).toHaveFocus();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('posts the message and shows a success state', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Sara');
    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'sara@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello from a test');

    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Thank you! Your message has been sent/)).toBeInTheDocument();

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(url)).toBe('https://formspree.io/f/test');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Sara',
      email: 'sara@example.com',
      message: 'Hello from a test',
    });
  });

  it('shows an error when the form service fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Sara');
    await user.type(screen.getByRole('textbox', { name: 'Your email' }), 'sara@example.com');
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText(/couldn't be sent/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
  });
});
