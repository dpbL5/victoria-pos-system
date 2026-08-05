# ui
- Use a blocking overlay (modal/backdrop) when no shift is open instead of only disabling buttons and showing warning banners. The overlay must cover only the content area, leaving both the bottom navigation (mobile) and sidebar navigation (desktop) accessible. Confidence: 0.82
- On mobile, hide the sidebar navigation and logout button; they should only display on desktop ratio. Confidence: 0.65
- When a desired UI component (e.g., Switch) doesn't exist in the component library, use a native HTML element with Tailwind styling instead of creating a new component. Confidence: 0.75
- When displaying data grouped by day, sort today's group to the top of the list. Confidence: 0.85
- When functionality moves to a dedicated module/page, remove the old tab and replace it with a navigation link to the new location rather than keeping both. Confidence: 0.80
- Destructive or significant actions should prompt for user confirmation via a dialog before execution, rather than executing immediately. Confidence: 0.80
