# Release guide

This guide covers the steps to release the Stoker plugin to the Obsidian community plugins directory.

## Pre-release checklist

Before releasing, verify the following:

- [ ] GitHub repository is **public**
- [ ] `authorUrl` in `manifest.json` points to a valid URL
- [ ] `fundingUrl` is valid (or remove it if not accepting donations)
- [ ] `version` in `manifest.json` follows semantic versioning (`x.y.z`)
- [ ] `minAppVersion` is set to the minimum Obsidian version your plugin supports
- [ ] All code changes are committed and pushed

## Step 1: Build the plugin

Run the production build to generate the release artifacts:

```bash
npm run build
```

This creates `main.js` in the project root.

## Step 2: Test locally

1. Copy the following files to your test vault's plugin folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`

2. Reload Obsidian (**Settings → Community plugins → Reload**)
3. Enable the plugin and verify all features work correctly

## Step 3: Update version numbers

When releasing a new version:

1. Update `version` in `manifest.json`:

```json
{
  "version": "1.0.0"
}
```

2. Update `versions.json` to map your plugin version to the minimum Obsidian version:

```json
{
  "1.0.0": "0.15.0"
}
```

3. Commit and push these changes

## Step 4: Create a GitHub release

1. Go to your GitHub repository
2. Select **Releases** → **Create a new release**
3. Select **Choose a tag** and create a new tag that **exactly matches** your `manifest.json` version
   - Use `1.0.0` not `v1.0.0` (no `v` prefix)
4. Set the release title (e.g., "1.0.0" or "Initial release")
5. Add release notes describing what's new
6. Attach these files as binary assets:
   - `main.js`
   - `manifest.json`
   - `styles.css`
7. Select **Publish release**

## Step 5: Submit to community plugins (first release only)

For your initial release, submit to the Obsidian community plugins directory:

1. Go to [community-plugins.json](https://github.com/obsidianmd/obsidian-releases/edit/master/community-plugins.json)

2. Add your plugin entry at the end of the JSON array (before the closing `]`):

```json
{
  "id": "stoker-plugin",
  "name": "Stoker",
  "author": "Dinar Garipov",
  "description": "Manage items in your stock.",
  "repo": "YOUR-USERNAME/stoker-plugin"
}
```

> **Note:** Replace `YOUR-USERNAME` with your actual GitHub username.

3. Select **Commit changes...** → **Propose changes**
4. Select **Create pull request**
5. Select **Preview** → select **Community Plugin**
6. Fill in the PR template:
   - Check all applicable boxes
   - Confirm you've read the developer policies
7. Select **Create pull request**

## Step 6: Wait for review

After submitting:

1. A bot will automatically validate your submission
2. Wait for the **Ready for review** label
   - If you see **Validation failed**, fix the issues listed and push updates
3. An Obsidian team member will review your plugin
4. Address any review comments by updating your release (don't create a new PR)

> **Note:** Review times vary. The Obsidian team is small, so be patient.

## Step 7: Announce your plugin

Once approved and published:

1. Post in [Obsidian Forum - Share & showcase](https://forum.obsidian.md/c/share-showcase/9)
2. Announce in the Obsidian Discord `#updates` channel
   - Requires the [developer role](https://discord.com/channels/686053708261228577/702717892533157999/830492034807758859)

## Releasing updates

For subsequent releases, you only need to:

1. Update version in `manifest.json`
2. Update `versions.json` if minimum Obsidian version changed
3. Run `npm run build`
4. Create a new GitHub release with the updated files

Users will automatically receive updates through Obsidian.

## Troubleshooting

### Release tag doesn't match manifest version

The GitHub release tag must exactly match the `version` in `manifest.json`. For example:
- `manifest.json` version: `1.0.0`
- GitHub tag: `1.0.0` (not `v1.0.0`)

### Bot validation failed

Common issues:
- Missing required fields in `manifest.json`
- Plugin ID contains "obsidian"
- Description doesn't end with a period
- Files missing from release assets

### Merge conflicts in PR

Don't worry about merge conflicts in your community-plugins.json PR. The Obsidian team will resolve them before merging.

## Resources

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Developer policies](https://docs.obsidian.md/Developer+policies)
- [Obsidian style guide](https://help.obsidian.md/style-guide)
