/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('the button', () => {
  it('lights up under the pointer and settles back when it leaves', async () => {
    const user = userEvent.setup();
    render(<Button variant="danger">Remove</Button>);
    const button = screen.getByRole('button', { name: 'Remove' });
    expect(button.style.filter).toBe('');

    await user.hover(button);
    expect(button.style.filter).toBe('brightness(1.15)');
    await user.unhover(button);
    expect(button.style.filter).toBe('none');
  });

  it('stays as it is under the pointer while disabled', async () => {
    const user = userEvent.setup();
    render(
      <Button variant="danger" disabled>
        Remove
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Remove' });
    expect(button.style.cursor).toBe('not-allowed');
    expect(button.style.opacity).toBe('0.5');

    await user.hover(button);
    expect(button.style.filter).toBe('');
    await user.unhover(button);
    expect(button.style.filter).toBe('');
  });

  it('shows its icon before the label, and can take the whole row', () => {
    render(
      <Button icon={<svg data-testid="icon" />} fullWidth>
        Send
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button.style.width).toBe('100%');
    expect(button.firstElementChild?.querySelector('[data-testid="icon"]')).not.toBeNull();
  });
});
