import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LanguageToggle } from '../components/LanguageToggle';

describe('LanguageToggle', () => {
  it('starts in English and shows the language selector trigger', () => {
    render(<LanguageToggle />);
    expect(screen.getByRole('button', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('switches between locales directly from the mobile segment', async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />);

    await user.click(screen.getByRole('button', { name: 'العربية' }));
    expect(document.documentElement.dir).toBe('rtl');

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('marks the active language with aria-current', async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />);

    await user.click(screen.getByRole('button', { name: 'Language' }));
    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute('aria-current', 'true');
  });
});

describe('language menu keyboard recovery', () => {
  it('supports arrows, Home/End, selection, and returns focus after Escape', async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />);
    const trigger = screen.getByRole('button', { name: 'Language' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'English' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('option', { name: 'العربية' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('option', { name: 'English' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(document.documentElement.lang).toBe('ar');
    expect(screen.getByRole('button', { name: 'اللغة' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'اللغة' })).toHaveFocus();
  });

  it('closes on Tab without trapping focus inside the options', async () => {
    const user = userEvent.setup();
    render(
      <>
        <LanguageToggle />
        <button>After menu</button>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'After menu' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
