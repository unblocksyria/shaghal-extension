/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('the text area', () => {
  it('links its label and help text to the field for assistive technology', () => {
    render(<Textarea label="Notes" helperText="Optional." />);
    const field = screen.getByRole('textbox', { name: 'Notes', description: 'Optional.' });
    expect(field).toHaveProperty('rows', 3);
    expect(field.getAttribute('aria-describedby')).toBe(screen.getByText('Optional.').id);
  });

  it('describes nothing when there is no help text, and keeps a given id and class', () => {
    render(<Textarea id="story" className="tall" rows={5} aria-label="Story" />);
    const field = screen.getByRole('textbox', { name: 'Story' });
    expect(field.id).toBe('story');
    expect(field.className).toBe('us-field tall');
    expect(field).toHaveProperty('rows', 5);
    expect(field.hasAttribute('aria-describedby')).toBe(false);
  });
});
