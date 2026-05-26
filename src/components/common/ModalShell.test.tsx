/**
 * Unit tests for `ModalShell` (DEL-101).
 *
 * Covers the focus-management contract added on top of the original
 * chrome:
 *   - focus moves into the dialog on mount;
 *   - Tab / Shift+Tab cycle within the dialog and cannot escape it;
 *   - closing the modal restores focus to the element that opened it;
 *   - Escape still calls `onClose`, and `closeOnChrome={false}` /
 *     `preventClose` still suppress chrome dismissal.
 *
 * No mocks needed — `ModalShell` is self-contained, so these render it
 * directly into jsdom and drive it with `user-event`.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ModalShell } from '@/components/common/ModalShell';

// ---- helpers --------------------------------------------------------------

/** Render a modal whose body has two focusable controls plus the × button. */
function renderModal(
  props: Partial<React.ComponentProps<typeof ModalShell>> = {},
) {
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <ModalShell title="Test Modal" onClose={onClose} {...props}>
      <button type="button">First</button>
      <button type="button">Second</button>
    </ModalShell>,
  );
  return { onClose, ...utils };
}

// ---- mount focus ----------------------------------------------------------

describe('ModalShell — mount focus', () => {
  it('moves focus into the dialog container on mount', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });
});

// ---- focus trap -----------------------------------------------------------

describe('ModalShell — focus trap', () => {
  it('Shift+Tab from the dialog container wraps to the last focusable', async () => {
    const user = userEvent.setup();
    renderModal();

    // Mount focus lands on the container; Shift+Tab backwards must not
    // escape behind the backdrop — it wraps to the last control instead.
    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'First' })).not.toHaveFocus();
    // Last focusable in DOM order is the second body button (× is in the
    // header, before the body).
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
  });

  it('Tab from the last focusable wraps to the first (the × button)', async () => {
    const user = userEvent.setup();
    renderModal();

    const second = screen.getByRole('button', { name: 'Second' });
    second.focus();
    expect(second).toHaveFocus();

    await user.tab();

    // First focusable in DOM order is the × close button.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('keeps focus pinned on the container when there are no focusable children', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalShell title="Empty" onClose={onClose} closeOnChrome={false}>
        <p>No controls here.</p>
      </ModalShell>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();

    await user.tab();
    expect(dialog).toHaveFocus();
  });
});

// ---- focus restoration ----------------------------------------------------

describe('ModalShell — focus restoration', () => {
  it('restores focus to the trigger element on unmount', () => {
    // A trigger button outside the modal, focused before the modal opens.
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { unmount } = renderModal();
    // Modal stole focus on mount.
    expect(trigger).not.toHaveFocus();

    unmount();

    // Closing returns focus to the trigger.
    expect(trigger).toHaveFocus();

    document.body.removeChild(trigger);
  });
});

// ---- existing chrome behaviour (regression) -------------------------------

describe('ModalShell — chrome dismissal unchanged', () => {
  it('calls onClose on Escape by default', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when closeOnChrome is false', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ closeOnChrome: false, onClose });

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    // × button is hidden in this mode.
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('ignores Escape and disables the × button when preventClose is true', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ preventClose: true, onClose });

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });
});
