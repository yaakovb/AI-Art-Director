# AI Art Director — Capability Spike Report

Run date: 2026-11-25 (about 11:18 Asia/Jerusalem, UTC+2), Cursor Cloud Agent environment.
No external APIs, API keys or AI packages were used. All inspection used the Python standard library (`spike/inspect.py`).

## Summary

| Capability | Result |
|---|---|
| Native image generation (`GenerateImage`) | **PASS** |
| Generation with a reference image (`reference_image_paths`) | **PASS** |
| Isolated critic subagent with `file_attachments` | **FAIL / NOT AVAILABLE**: this session has no Task/subagent tool |
| Image inspection by the agent itself (`Read` on an image file) | **PASS** |

## 1. Tool availability

### Image generation: `GenerateImage`

Available, but not as a top-level tool. It is in the dynamic tool namespace `cursor`, where it is discovered with `GetDynamicTools` and called with `CallDynamicTool` (`namespace: "cursor"`, `toolName: "GenerateImage"`).

Input schema, exactly as exposed:

| Parameter | Type | Required | Description (verbatim) |
|---|---|---|---|
| `description` | string | yes | "A detailed description of the image, at least 6 words. Descriptions of 3 words or fewer are rejected." |
| `filename` | string | no | "Optional filename for the generated image (e.g., 'diagram.png'). Do not include a directory path - the tool automatically handles where to save and how to display the image. If not provided, a timestamped filename will be generated." |
| `reference_image_paths` | array of string | no | "Optional array of file paths to reference images as additional inputs." |
| `aspect_ratio` | string, enum `"1:1"`, `"4:3"`, `"3:4"`, `"16:9"`, `"9:16"` | no | "Optional aspect ratio for the generated image. Supported values are \"1:1\", \"4:3\", \"3:4\", \"16:9\", and \"9:16\"." |

The tool description also includes these usage rules: "Only use this tool when the user explicitly asks for an image" and "Do not use this tool for data heavy visualizations such as charts, plots, tables."

### Subagent: `Task`

**Not available.** There is no `Task` tool (and no other subagent-spawning tool) among the top-level tools, and `GetDynamicTools` searches for `task|subagent|agent` returned no such tool. As a result, `file_attachments` could not be tested. Tools available in this session: Shell, Glob, Grep, Read, StrReplace, Write, RecordScreen, GetDynamicTools, CallDynamicTool, ManagePullRequest, EditPullRequestLabels, WriteCanvas, ReadCanvas. The dynamic namespaces were `cursor` (AwaitShell, Delete, EditNotebook, FetchMcpResource, GenerateImage, SetActiveBranch, TodoWrite, WebFetch, WebSearch), `cursor-cloud`, `cursor-github`, `cursor-origin`, `cursor-subscriptions` and `Atlassian`.

## 2–3, 7. Generations

The tool's only response was text of the form `Successfully generated image. Display it in your response using: <img src="/opt/cursor/artifacts/assets/<name>.jpg" ... />`. No errors occurred.

The durations are wall-clock times from a `date` call immediately before each call to the file's mtime, which has 1-second resolution. The upper bound runs to a `date` call immediately after.

| # | Requested filename | Returned path | Duration | Format (actual bytes) | Dimensions | Color / alpha | File size |
|---|---|---|---|---|---|---|---|
| 1 Reference (1:1) | `spike-reference.png` | `/opt/cursor/artifacts/assets/spike-reference.jpg` | ~17 s (≤ 18.7 s) | JPEG baseline (SOF0), JFIF 1.01 | 1024 × 1024 | 8-bit, 3 components YCbCr (RGB), **no alpha** | 262,559 B |
| 2 Variation (1:1, with reference) | `spike-variation.png` | `/opt/cursor/artifacts/assets/spike-variation.jpg` | ~19 s (≤ 20.1 s) | JPEG baseline (SOF0), JFIF 1.01 | 1024 × 1024 | 8-bit, 3 components YCbCr (RGB), **no alpha** | 229,062 B |
| 3 Chest (3:4) | `spike-chest.png` | `/opt/cursor/artifacts/assets/spike-chest.jpg` | ~10 s (≤ 12.5 s) | JPEG baseline (SOF0), JFIF 1.01 | 864 × 1152 | 8-bit, 3 components YCbCr (RGB), **no alpha** | 192,301 B |

For the variation, `reference_image_paths` was `["/opt/cursor/artifacts/assets/spike-reference.jpg"]`, the path the tool returned for the reference.

## 4. Local file inspection

Output of `python3 spike/inspect.py reference.png variation.png chest.png`:

```
reference.png: size=262559 bytes
  png_signature_valid=False  first_bytes=ffd8ffe000104a46
  format: JPEG (SOF0)  width=1024 height=1024 bit_depth=8 components=3 (YCbCr (RGB)) alpha=False
variation.png: size=229062 bytes
  png_signature_valid=False  first_bytes=ffd8ffe000104a46
  format: JPEG (SOF0)  width=1024 height=1024 bit_depth=8 components=3 (YCbCr (RGB)) alpha=False
chest.png: size=192301 bytes
  png_signature_valid=False  first_bytes=ffd8ffe000104a46
  format: JPEG (SOF0)  width=864 height=1152 bit_depth=8 components=3 (YCbCr (RGB)) alpha=False
```

- **No file is a PNG.** The 8-byte PNG signature check fails, and the bytes start with the JPEG SOI/APP0 (JFIF) markers. There is no IHDR chunk, so PNG width, height, bit depth and color type do not apply. Those values were read from the JPEG SOF0 header instead.
- **No alpha channel**, because JPEG cannot carry one. Corner transparency sampling was skipped since there is nothing to sample. The script's PNG/IDAT path, which includes corner-alpha sampling, is implemented but was not exercised.

## 5. Files in `spike/`

`spike/reference.png`, `spike/variation.png` and `spike/chest.png` are byte-identical copies of the three `.jpg` outputs, renamed to the `.png` names the spike requested. **They contain JPEG data despite the `.png` extension.** Downstream code must sniff the magic bytes or convert them, and must not trust the extension. `ffmpeg` is installed locally and could convert them to real PNGs. Pillow is not installed.

## Was the reference honored? (my own judgment after viewing both with `Read`)

**Yes, strongly.** The variation shows the same character: the same face and smile, the blue helmet with a gold crest and red plume, the gold cross on the chest plate, the brown belt and pouch, the chainmail sleeves, and the same oval red shield with a gold rim and gold fleur-de-lis. The line weight, cel shading and palette are the same, and the background is the same plain light gray. The pose changed as requested: the right arm raises a silver sword with a gold hilt above the head. The design was preserved almost exactly. Only the pose and arm changed.

Side observation: the reference image already included a silver sword held low, which the prompt did not ask for. The prompt mentioned only the shield. The model added a prop on its own.

The chest image (3:4) is a clean cartoon wooden chest with gold bands and a keyhole plate, on a plain mid-gray background.

## 6. Critic subagent: NOT EXECUTED

- **Subagent inspection via `file_attachments` did NOT work, because the Task tool does not exist in this Cloud Agent session.** No subagent was launched, so there is no critic JSON and no subagent descriptions to report.
- **Control check:** not possible, because no subagent response exists to compare against the prompts.
- **Fallback (main agent `Read`):** I opened both files with `Read` and could see them. This worked even though the files are JPEG. I saw blue armor with gold trim, a round red shield with a gold rim and fleur-de-lis, a red plume, a silver sword held low in the reference and raised overhead in the variation, and a plain light-gray background. These match the prompts. This shows that the *main* agent can inspect images, but it is **not** an isolated critic. The main agent knows the prompts, so it cannot provide the blind evaluation the project design calls for.

## Limitations observed

1. **The output format is JPEG, not PNG.** A `.png` filename is ignored, and the tool rewrites the extension to `.jpg`. There is no format parameter.
2. **No transparency.** The output is 3-channel JPEG, so assets with a transparent background need a separate local background-removal step. For example, chroma-key on the requested solid background color with ffmpeg or a stdlib script. JPEG compression artifacts around edges will make clean keying harder.
3. **The save location is fixed.** Files are written to `/opt/cursor/artifacts/assets/<filename-stem>.jpg`, and directory paths in `filename` are not allowed. Files must be copied into the repo afterwards.
4. **Size control is limited to aspect ratio.** Two resolutions were observed: 1:1 gives 1024×1024, and 3:4 gives 864×1152. 4:3, 16:9 and 9:16 were not tested; 4:3 is presumably 1152×864, but that is unverified. There is no explicit width/height parameter.
5. **The tool response is minimal.** It returns only a success string with the path. There is no seed, no revised prompt and no metadata.
6. **Latency** is about 10–20 s per call. No rate limiting or errors were seen across 3 sequential calls, but this small sample says nothing about limits under heavier use.
7. **The tool is only reachable through the `cursor` dynamic namespace** (`GetDynamicTools` / `CallDynamicTool`), not as a top-level tool. Its description restricts use to explicit image requests.
8. **No Task/subagent tool exists in this environment**, so the planned isolated critic architecture cannot run here as designed. Possible alternatives (none tested): run the critic in a separate Cloud Agent run, if one can be launched by other means; run the critic in a Cursor client where the Task tool exists; or accept a non-blind critic in the main agent.
9. **The model may add unrequested props**, such as the sword in the reference image.
