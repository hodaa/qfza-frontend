import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContactForm } from '../components/ContactForm';
import { VideoUrlForm } from '../components/VideoUrlForm';
import { fieldStateClass } from '../utils/fieldStyles';

vi.mock('../config', () => ({
  CONTACT_FORM_ENDPOINT: 'https://formspree.io/f/test',
  CONTACT_EMAIL: 'test@example.com',
  CSRF_TOKEN: '',
  CSRF_HEADER_NAME: 'X-CSRF-Token',
  GOOGLE_CLIENT_ID: '',
}));

/**
 * One invalid field looks the same wherever it is.
 *
 * The contact form and the URL form are the same control behind different
 * labels, and a visitor who is told one of their fields is invalid should not
 * have to work out whether a red outline means "you made a mistake" in one form
 * and "nothing at all" in the other. The shared helper is what guarantees it, so
 * these pin the two forms together rather than pinning one of them.
 */
describe('shared invalid-field styling', () => {
  it('returns a red border and tint only when there is an error', () => {
    const invalid = fieldStateClass(true);
    const valid = fieldStateClass(false);

    expect(invalid).toContain('border-danger');
    expect(invalid).toContain('bg-danger-soft');
    expect(invalid).toContain('focus:ring-danger');
    // The two states must not share a border or background, or the "invalid"
    // styling would be silently overridden by whichever class came last.
    expect(invalid).not.toBe(valid);
    // Each state must be free of the other's border, tint and ring, or whichever
    // class happened to come last would silently win.
    for (const token of ['border-slate-200', 'bg-slate-50', 'focus:border-action']) {
      expect(invalid).not.toContain(token);
    }
    for (const token of ['border-danger', 'bg-danger-soft', 'focus:ring-danger']) {
      expect(valid).not.toContain(token);
    }
  });

  it("marks the contact form's first invalid field with that same class", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const field = await screen.findByLabelText(/name/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    for (const token of fieldStateClass(true).split(' ')) {
      expect(field.className).toContain(token);
    }
  });

  it("marks the URL form's first invalid field with that same class", async () => {
    const user = userEvent.setup();
    render(<VideoUrlForm onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Jump to video' }));

    const field = await screen.findByLabelText(/video url/i);
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    for (const token of fieldStateClass(true).split(' ')) {
      expect(field.className).toContain(token);
    }
  });
});
