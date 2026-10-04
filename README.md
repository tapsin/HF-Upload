# HF Upload

HF Upload is an Electron desktop application for preparing common dataset files and uploading files to Hugging Face Hub repositories. It includes a React interface, local conversion tools, encrypted token storage through Electron `safeStorage`, and GitHub Actions workflows for Linux and Windows packages.

> This project is under active development. Review the limitations below before relying on a conversion for production or sharing sensitive data.

## Features

- Upload selected files to Hugging Face Dataset or Model repositories using `@huggingface/hub`.
- Save and remove a Hugging Face access token using the operating system's encrypted storage when available.
- Convert CSV files to JSONL, Parquet, Hugging Face dataset-folder scaffolding, YOLO labels, COCO, CreateML, Pascal VOC, and Label Studio outputs.
- Copy selected DICOM files into a series folder and write a conversion report.
- Build Linux AppImage and Windows NSIS packages through GitHub Actions on version tags or manual dispatch.

## Requirements

- Node.js 22 or newer and npm.
- A Hugging Face account and an access token with write permission for the target repository.
- Linux or Windows for the corresponding desktop package. macOS packaging is not configured.

## Run from source

```bash
npm ci
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Create installers locally

```bash
# Linux AppImage
npm run dist:linux

# Windows NSIS installer (run on Windows)
npm run dist:windows
```

Packages are written to `release/`. GitHub Actions can also build them: push a version tag such as `v0.1.0`, or start the Linux and Windows workflows manually from the Actions tab. Workflow artifacts are attached to the completed run; they are not automatically published as GitHub Releases.

## Current limitations and planned work

- Bucket upload is not implemented yet. The current upload handler maps the Model option to a model repository and other choices, including Bucket, to a dataset repository.
- The format selector contains options that are not all implemented as source formats. The working conversion paths currently read CSV input; unsupported conversion pairs report an error.
- CSV parsing currently uses simple line and delimiter splitting. Quoted fields containing commas, embedded newlines, and other complex CSV cases need a proper parser.
- YOLO conversion writes labels and class metadata, but does not copy the referenced images into the output `images/` directory.
- The DICOM action copies original files without removing patient metadata. Review and anonymize DICOM metadata with a suitable tool before sharing those files.
- Conversion results and Hub uploads have not yet had comprehensive end-to-end fixture coverage across all supported formats and operating systems.

Planned work:

1. Add correct Hugging Face Bucket uploads and validate repository targets before transfer.
2. Replace ad-hoc CSV parsing with a standards-compliant parser and add representative conversion fixtures.
3. Improve conversion progress, validation messages, and output summaries.
4. Add an explicit DICOM anonymization workflow with safe preview and validation before sharing.
5. Verify packaged Linux and Windows apps with real upload and conversion workflows, then publish versioned GitHub Releases.

## Security and privacy

- The app stores the Hugging Face token in Electron's `safeStorage` encrypted form when the operating system reports encryption is available. The token is removed when **Tokenı unut** is used. Do not use this app on a system where you do not trust the local account.
- Files selected for upload are sent to the Hugging Face repository configured in the app. Check the repository visibility and contents before uploading.
- Conversions write output folders or files alongside the selected input. DICOM conversion preserves original metadata; it does not anonymize patient information.
- Do not commit access tokens, private datasets, local package artifacts, or personal information to this repository.

## Contributing

Issues and pull requests are welcome. Please include a small, non-sensitive fixture and the expected output when reporting a conversion issue. Never attach real patient data or access tokens.

## DONATE

<table border="1">
<tr><td>USDT TRC20</td><td><code>TYCK6ZyMS6UDt787foPH2QwFuvkdqMw1Jv</code></td></tr>
<tr><td>USDT BSC20</td><td><code>0x15aac92a1945ddbe5c79304bfa388d6be99b26a3</code></td></tr>
</table>

Created by TAPSIN
