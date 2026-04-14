# Cossistant React SDK

Build a ready-to-use support widget in React with good defaults, fast styling,
and a composable API when you need to go further.

## Install

```bash
bun add @cossistant/react
```

## Import styles

Use one stylesheet at your app root:

```tsx
import "@cossistant/react/styles.css";
```

Or, if your app already uses Tailwind CSS v4:

```tsx
import "@cossistant/react/support.css";
```

## Quickstart

```tsx
import { Support, SupportProvider } from "@cossistant/react";
import "@cossistant/react/styles.css";

export function App() {
  return (
    <SupportProvider publicKey="pk_live_...">
      <Support />
    </SupportProvider>
  );
}
```

`Support` is the batteries-included widget. It ships with the default trigger,
router, home page, conversation page, timeline, composer, and styling hooks.

## Swap One Part with `slots`

Use `slots` when you want better DX than rebuilding the whole widget tree.

```tsx
import {
  Support,
  type SupportHomePageSlotProps,
  type SupportTriggerSlotProps,
} from "@cossistant/react";

function CustomBubble({
  isOpen,
  unreadCount,
  toggle,
  className,
  ...props
}: SupportTriggerSlotProps) {
  return (
    <button
      {...props}
      className={className}
      onClick={toggle}
      type="button"
    >
      {isOpen ? "Close" : "Need help?"} ({unreadCount})
    </button>
  );
}

function CustomHomePage({
  quickOptions,
  startConversation,
}: SupportHomePageSlotProps) {
  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <h2 className="text-2xl font-semibold">Real support, instantly.</h2>
      {quickOptions.map((option) => (
        <button
          key={option}
          onClick={() => startConversation(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

<Support
  slots={{
    trigger: CustomBubble,
    homePage: CustomHomePage,
  }}
  slotProps={{
    content: {
      className: "rounded-3xl border shadow-2xl",
    },
  }}
/>;
```

## Full Composition with `Support.Root`

Use `Support.Root` when you want a custom shell and explicit page registration.

```tsx
import { Support } from "@cossistant/react";

function LaunchChecklistPage() {
  return <div className="p-6">Your custom home page</div>;
}

export function App() {
  return (
    <Support.Root open>
      <Support.Trigger asChild>
        <button type="button">Compose support</button>
      </Support.Trigger>

      <Support.Content className="rounded-3xl border shadow-2xl">
        <Support.Router>
          <Support.Page component={LaunchChecklistPage} name="HOME" />
        </Support.Router>
      </Support.Content>
    </Support.Root>
  );
}
```

## Styling Hooks

Start with:

- `classNames.trigger`
- `classNames.content`
- `slotProps`

The default widget also exposes stable DOM hooks:

- `data-slot`
- `data-state`
- `data-page`

That makes it easy to style with plain CSS or Tailwind selectors without
rewriting the widget.

## More Docs

- [React Support docs](https://cossistant.com/docs/support-component)
- [Customization guide](https://cossistant.com/docs/support-component/customization)
- [Routing guide](https://cossistant.com/docs/support-component/routing)
