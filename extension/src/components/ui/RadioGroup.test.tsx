/** @vitest-environment jsdom */
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { RadioGroup } from './RadioGroup';

const OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'english', label: 'English' },
  { value: 'arabic', label: 'Arabic' },
];

/** Same shape as the Settings rows. `dir` sets which way the buttons run. */
function Row(props: { dir?: 'ltr' | 'rtl' }) {
  const [picked, setPicked] = useState('system');
  return (
    <div dir={props.dir}>
      <RadioGroup aria-label="Language">
        {OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={picked === value}
            tabIndex={picked === value ? 0 : -1}
            onClick={() => setPicked(value)}
          >
            {label}
          </button>
        ))}
      </RadioGroup>
    </div>
  );
}

const radio = (label: string) =>
  within(screen.getByRole('radiogroup', { name: 'Language' })).getByRole('radio', { name: label });
const checked = (label: string) => radio(label).getAttribute('aria-checked') === 'true';

afterEach(() => {
  document.documentElement.dir = 'ltr';
  document.documentElement.lang = 'en';
});

describe('arrow keys in a radio group', () => {
  it('steps through the DOM order when the text runs left to right', async () => {
    const user = userEvent.setup();
    render(<Row dir="ltr" />);
    radio('System').focus();

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(radio('Arabic'));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(radio('System'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(radio('English'));
  });

  it('steps in the direction the arrow points when the text runs right to left', async () => {
    const user = userEvent.setup();
    render(<Row dir="rtl" />);
    // Buttons read System, English, Arabic from the right, so ArrowLeft moves to English.
    radio('System').focus();

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(radio('English'));
    expect(checked('English')).toBe(true);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(radio('Arabic'));

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(radio('English'));
    expect(checked('English')).toBe(true);
  });

  it('keeps the vertical keys and Home and End the same in both directions', async () => {
    const user = userEvent.setup();
    render(<Row dir="rtl" />);
    radio('System').focus();

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(radio('English'));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(radio('System'));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(radio('Arabic'));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(radio('System'));
  });

  it('reads the direction of the document root when no nearer dir is set', async () => {
    const user = userEvent.setup();
    document.documentElement.dir = 'rtl';
    render(<Row />);
    radio('System').focus();

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(radio('English'));
  });
});

/** A row with one radio disabled and a plain button beside the radios. */
function MixedRow() {
  const [picked, setPicked] = useState('system');
  return (
    <RadioGroup aria-label="Language">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={picked === value}
          tabIndex={picked === value ? 0 : -1}
          disabled={value === 'english'}
          onClick={() => setPicked(value)}
        >
          {label}
        </button>
      ))}
      <button type="button">Help</button>
    </RadioGroup>
  );
}

describe('keys a radio group leaves alone', () => {
  it('moves for no key but the arrows, Home and End', async () => {
    const user = userEvent.setup();
    render(<Row />);
    radio('System').focus();
    await user.keyboard('{Enter}');
    await user.keyboard('a');
    await user.keyboard('{PageDown}');
    expect(document.activeElement).toBe(radio('System'));
    expect(checked('System')).toBe(true);
  });

  it('does nothing for a key pressed on something in the group that is not a radio', async () => {
    const user = userEvent.setup();
    render(<MixedRow />);
    const help = screen.getByRole('button', { name: 'Help' });
    help.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(help);
    expect(checked('System')).toBe(true);
  });

  it('skips a disabled radio', async () => {
    const user = userEvent.setup();
    render(<MixedRow />);
    radio('System').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(radio('Arabic'));
    expect(checked('Arabic')).toBe(true);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(radio('System'));
  });

  it('runs left to right when nothing declares a direction', async () => {
    const user = userEvent.setup();
    document.documentElement.removeAttribute('dir');
    render(<Row />);
    radio('System').focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(radio('Arabic'));
  });
});
