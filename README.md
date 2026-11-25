# AI Art Director

Autonomously generates and evaluates cartoon game assets inside Cursor Agent.

- The Cursor Agent acts as Orchestrator and Art Director.
- Images are generated with Cursor's native image-generation tool.
- An isolated Art Critic subagent compares each generated PNG with the reference image and returns structured JSON.
- The loop repeats until the image is approved or five attempts have been made.
