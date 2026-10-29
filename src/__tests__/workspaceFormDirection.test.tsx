import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { ContactForm } from '../components/ContactForm';
import { KeywordSearchForm } from '../components/KeywordSearchForm';
import { VideoUrlForm } from '../components/VideoUrlForm';

const onSubmit = vi.fn();

afterEach(() => {
  act(() => setLanguage('en'));
});

describe('workspace form direction', () => {
  it('aligns the Arabic video URL placeholder RTL', async () => {
    await act(async () => setLanguage('ar'));
    render(<VideoUrlForm onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('الصق رابط يوتيوب أو جوجل درايف');
    expect(input).toHaveAttribute('dir', 'rtl');
    expect(input.className).toContain('placeholder:text-right');
  });

  it('aligns the Arabic keyword placeholder RTL', async () => {
    await act(async () => setLanguage('ar'));
    render(<KeywordSearchForm onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText('مثال: العرض والطلب');
    expect(input).toHaveAttribute('dir', 'rtl');
    expect(input.className).toContain('placeholder:text-right');
  });

  it('aligns Arabic contact placeholders RTL and keeps email LTR', async () => {
    await act(async () => setLanguage('ar'));
    render(<ContactForm />);

    const name = screen.getByPlaceholderText('مثال: سارة أحمد');
    const message = screen.getByPlaceholderText('أخبرنا بما يدور في ذهنك…');
    const email = screen.getByPlaceholderText('you@example.com');

    expect(name).toHaveAttribute('dir', 'rtl');
    expect(name.className).toContain('placeholder:text-right');
    expect(message).toHaveAttribute('dir', 'rtl');
    expect(message.className).toContain('placeholder:text-right');
    expect(email).toHaveAttribute('dir', 'ltr');
    expect(email.className).toContain('placeholder:text-left');
  });

  it('keeps both English placeholders LTR', () => {
    render(
      <>
        <VideoUrlForm onSubmit={onSubmit} />
        <KeywordSearchForm onSubmit={onSubmit} />
      </>,
    );

    const url = screen.getByPlaceholderText('Paste a YouTube or Google Drive link');
    const keyword = screen.getByPlaceholderText('e.g. supply and demand');
    expect(url).toHaveAttribute('dir', 'ltr');
    expect(url.className).toContain('placeholder:text-left');
    expect(keyword).toHaveAttribute('dir', 'auto');
    expect(keyword.className).toContain('placeholder:text-left');
  });

  it('follows a live switch to Arabic', async () => {
    render(<VideoUrlForm onSubmit={onSubmit} />);
    const input = screen.getByPlaceholderText('Paste a YouTube or Google Drive link');

    await act(async () => setLanguage('ar'));

    expect(input).toHaveAttribute('dir', 'rtl');
    expect(input).toHaveAttribute('placeholder', 'الصق رابط يوتيوب أو جوجل درايف');
  });
});
