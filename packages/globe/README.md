# @cossistant/globe

React-first WebGL globe with real React pin overlays and built-in clustering.

## Installation

```bash
npm install @cossistant/globe
```

## Basic usage

```tsx
"use client";

import { Globe } from "@cossistant/globe";

export function Example() {
	return (
		<div style={{ width: 420 }}>
			<Globe>
				<Globe.Pin id="sf" latitude={37.7749} longitude={-122.4194}>
					<div>San Francisco</div>
				</Globe.Pin>
			</Globe>
		</div>
	);
}
```

## Clustering

Clustering is enabled by default in `auto` mode.

```tsx
<Globe
	clustering={{
		mode: "auto",
		threshold: 120,
		cellDegrees: 5,
	}}
>
	{pins}
</Globe>
```

## Cossistant preset

```tsx
import { CossistantGlobe } from "@cossistant/globe/cossistant";
```
