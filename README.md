# Stoker - Inventory Tracker for Obsidian

Track any inventory in your Obsidian vault. Monitor stock levels, set minimum thresholds, get warnings when running low, and generate shopping lists.

## Features

- **Track anything**: Products, supplies, tools, collectibles - whatever you need to keep stock of
- **Multiple lists**: Create separate inventory lists (home, office, workshop) each stored in a markdown file
- **Stock status tracking**: Visual indicators for normal, low, and out-of-stock items
- **Minimum thresholds**: Set warning levels for each item
- **Shopping list**: Mark items for restock and generate shopping lists
- **Unit types**: Support for count, portion, weight, volume, and boolean (in/out of stock)
- **Categories**: Organize items by custom categories (created dynamically as you add items)
- **Reports**: Generate printable inventory reports
- **Syncs with Obsidian Sync**: All data stored in standard markdown files

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community plugins**
2. Select **Browse** and search for "Stoker"
3. Select **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder `<vault>/.obsidian/plugins/stoker-plugin/`
3. Copy the downloaded files into this folder
4. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Usage

### Getting Started

1. Select the package icon in the ribbon or run the command **Stoker: Open inventory**
2. Create your first inventory list when prompted
3. Add items using the **Add item** button

### Managing Items

- Select an item row to edit it
- Use **+/-** buttons to quickly adjust amounts
- Select the shopping cart icon to mark items for restock
- Set minimum thresholds to get low-stock warnings

### Categories

Categories are created automatically when you add items. To manage categories:
1. Open the inventory view
2. Select the settings icon next to the category filter
3. Rename or delete categories as needed

### Multiple Lists

Create separate lists for different locations or purposes:
1. Open **Settings → Stoker**
2. Select **Open list manager**
3. Create new lists or switch between existing ones

## Commands

- **Open inventory**: Open the main inventory view
- **Add new item to inventory**: Quick add without opening the view
- **Toggle inventory sidebar**: Show/hide the sidebar panel
- **Show low stock items**: Filter to items needing attention
- **Open inventory report**: Generate printable reports
- **Open inventory list manager**: Manage multiple lists
- **Switch to inventory list...**: Quick list switcher
- **Create new inventory list**: Create a new list

## Data Format

Inventory data is stored in markdown files with the following format:

```markdown
---
stoker-plugin: inventory
version: 1
lastUpdated: 2025-01-29
---

## Category Name

- [ ] Item Name | 5 pcs | min: 2
- [!] Low Stock Item | 1 pcs | min: 3
- [-] Out of Stock | 0 pcs
- [x] Boolean Item | in stock
```

## Support

- Report issues on [GitHub](https://github.com/garf/stoker-plugin)
- For questions, use GitHub Discussions

## License

0-BSD License - see [LICENSE](LICENSE)
