# floating-panels

The shell every window-like thing floats on, and the panels that ride on it: the dialog, the blocking modals, the drag, the tab ring. `confirmationService.ts` and `<ConfirmationHost>` are what every action's question goes through — the asking code is not a component, so the host draws the pending question for it.
