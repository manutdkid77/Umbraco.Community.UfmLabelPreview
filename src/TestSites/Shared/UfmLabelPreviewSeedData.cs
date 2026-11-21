// Seeds the ULP test fixtures (element types and block data types) on every start, skipping what already exists.

using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Strings;

namespace UfmLabelPreview.TestSites;

public class UfmLabelPreviewSeedComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
        => builder.AddNotificationAsyncHandler<UmbracoApplicationStartedNotification, UfmLabelPreviewSeedHandler>();
}

public class UfmLabelPreviewSeedHandler(
    IContentTypeService contentTypeService,
    IDataTypeService dataTypeService,
    PropertyEditorCollection propertyEditors,
    IConfigurationEditorJsonSerializer configurationSerializer,
    IShortStringHelper shortStringHelper,
    ILogger<UfmLabelPreviewSeedHandler> logger)
    : INotificationAsyncHandler<UmbracoApplicationStartedNotification>
{
    // Fixed keys keep the fixtures identical across sites.
    private static readonly Guid BaseKey = new("a1000000-0000-4000-8000-000000000001");
    private static readonly Guid SettingsKey = new("a1000000-0000-4000-8000-000000000002");
    private static readonly Guid BlockKey = new("a1000000-0000-4000-8000-000000000003");
    private static readonly Guid CompositionKey = new("a1000000-0000-4000-8000-000000000004");

    public async Task HandleAsync(UmbracoApplicationStartedNotification notification, CancellationToken cancellationToken)
    {
        try
        {
            var userKey = Constants.Security.SuperUserKey;
            var byName = (await dataTypeService.GetAllAsync()).ToDictionary(d => d.Name ?? string.Empty, d => d, StringComparer.OrdinalIgnoreCase);

            IDataType? Find(string name) => byName.GetValueOrDefault(name);

            // Default data types are found by editor alias because names differ between Umbraco versions.
            IDataType? FindByEditor(string editorAlias, params string[] preferredNames)
            {
                var matches = byName.Values.Where(d => d.EditorAlias == editorAlias && d.Name?.StartsWith("ULP ") != true).ToList();
                return matches.FirstOrDefault(d => preferredNames.Contains(d.Name, StringComparer.OrdinalIgnoreCase))
                    ?? matches.FirstOrDefault();
            }

            var textstring = FindByEditor("Umbraco.TextBox", "Textstring", "Text Box");
            var richText = FindByEditor("Umbraco.RichText", "Richtext editor", "Rich Text Editor");
            var contentPicker = FindByEditor("Umbraco.ContentPicker", "Content Picker");
            var mediaPicker = FindByEditor("Umbraco.MediaPicker3", "Media Picker");
            var multiUrl = FindByEditor("Umbraco.MultiUrlPicker", "Multi URL Picker");
            var numeric = FindByEditor("Umbraco.Integer", "Numeric");
            var trueFalse = FindByEditor("Umbraco.TrueFalse", "True/false");
            var dropdown = FindByEditor("Umbraco.DropDown.Flexible", "Dropdown");
            if (textstring is null)
            {
                logger.LogWarning("ULP seed: no Textstring data type found, skipping the fixtures.");
                return;
            }
            // The Element Picker editor only exists on Umbraco 18+.
            var elementPicker = Find("ULP Element Picker");
            if (elementPicker is null && propertyEditors.TryGet("Umbraco.ElementPicker", out var elementPickerEditor))
            {
                elementPicker = new DataType(elementPickerEditor, configurationSerializer) { Name = "ULP Element Picker", EditorUiAlias = "Umb.PropertyEditorUi.ElementPicker" };
                elementPicker = await CreateDataType(elementPicker, userKey);
            }

            // Element types: a composition, a settings type, the main block and a block with no settings type.
            var baseType = await CreateElementType(BaseKey, "ulpTestBase", "ULP Test Base", userKey, null, [
                ("baseNote", "Base note", textstring),
            ]);

            var settingsProps = new List<(string, string, IDataType)> { ("subtitle", "Subtitle", textstring) };
            if (dropdown is not null)
            {
                settingsProps.Add(("theme", "Theme", dropdown));
            }

            var settingsType = await CreateElementType(SettingsKey, "ulpTestSettings", "ULP Test Settings", userKey, null, settingsProps);

            var blockProps = new List<(string, string, IDataType)> { ("title", "Title", textstring) };
            void AddProp(string alias, string name, IDataType? dataType)
            {
                if (dataType is not null)
                {
                    blockProps.Add((alias, name, dataType));
                }
            }

            AddProp("body", "Body", richText);
            AddProp("picker", "Picker", contentPicker);
            AddProp("image", "Image", mediaPicker);
            AddProp("link", "Link", multiUrl);
            AddProp("count", "Count", numeric);
            AddProp("flag", "Flag", trueFalse);
            AddProp("elementPicker", "Element picker", elementPicker);

            var blockType = await CreateElementType(BlockKey, "ulpTestBlock", "ULP Test Block", userKey, null, blockProps);
            var compositionType = await CreateElementType(CompositionKey, "ulpTestComposition", "ULP Test Composition", userKey, baseType, [
                ("heading", "Heading", textstring),
            ]);

            if (blockType is null)
            {
                logger.LogWarning("ULP seed: the ULP Test Block element type is missing, skipping the block data types.");
                return;
            }

            var blocks = new List<Dictionary<string, object?>>
            {
                BlockConfig(blockType.Key, settingsType?.Key, "{=title}"),
            };
            if (compositionType is not null)
            {
                blocks.Add(BlockConfig(compositionType.Key, null, "{=heading} {=baseNote}"));
            }

            await EnsureBlockDataType(byName, "ULP Block List", "Umbraco.BlockList", "Umb.PropertyEditorUi.BlockList", blocks, userKey);
            await EnsureBlockDataType(byName, "ULP Block Grid", "Umbraco.BlockGrid", "Umb.PropertyEditorUi.BlockGrid", blocks.Select(AsGridBlock).ToList(), userKey);
            await EnsureBlockDataType(byName, "ULP Block Single", "Umbraco.SingleBlock", "Umb.PropertyEditorUi.BlockSingle", [blocks[0]], userKey);
            await EnsureBlockDataType(byName, "ULP Rich Text", "Umbraco.RichText", "Umb.PropertyEditorUi.Tiptap", blocks, userKey);
        }
        catch (Exception ex)
        {
            // Fixtures are optional, so never block startup.
            logger.LogWarning(ex, "ULP seed: could not create the test fixtures.");
        }
    }

    private static Dictionary<string, object?> BlockConfig(Guid contentKey, Guid? settingsKey, string label) => new()
    {
        ["contentElementTypeKey"] = contentKey,
        ["settingsElementTypeKey"] = settingsKey,
        ["label"] = label,
    };

    // Grid blocks must be allowed at the root to be addable.
    private static Dictionary<string, object?> AsGridBlock(Dictionary<string, object?> block)
        => new(block) { ["allowAtRoot"] = true, ["allowInAreas"] = false };

    private async Task EnsureBlockDataType(
        Dictionary<string, IDataType> byName,
        string name,
        string editorAlias,
        string editorUiAlias,
        List<Dictionary<string, object?>> blocks,
        Guid userKey)
    {
        if (byName.ContainsKey(name))
        {
            return;
        }

        if (!propertyEditors.TryGet(editorAlias, out var editor))
        {
            logger.LogInformation("ULP seed: editor {Editor} is not available, skipping {Name}.", editorAlias, name);
            return;
        }

        var dataType = new DataType(editor, configurationSerializer)
        {
            Name = name,
            EditorUiAlias = editorUiAlias,
            ConfigurationData = new Dictionary<string, object> { ["blocks"] = blocks },
        };
        var created = await CreateDataType(dataType, userKey);
        if (created is not null)
        {
            byName[name] = created;
        }
    }

    private async Task<IDataType?> CreateDataType(IDataType dataType, Guid userKey)
    {
        var result = await dataTypeService.CreateAsync(dataType, userKey);
        if (!result.Success)
        {
            logger.LogWarning("ULP seed: could not create data type {Name}: {Status}", dataType.Name, result.Status);
            return null;
        }

        logger.LogInformation("ULP seed: created data type {Name}.", dataType.Name);
        return result.Result;
    }

    private async Task<IContentType?> CreateElementType(
        Guid key,
        string alias,
        string name,
        Guid userKey,
        IContentType? composition,
        IEnumerable<(string Alias, string Name, IDataType DataType)> properties)
    {
        var existing = await contentTypeService.GetAsync(key) ?? contentTypeService.Get(alias);
        if (existing is not null)
        {
            return existing;
        }

        var contentType = new ContentType(shortStringHelper, -1)
        {
            Key = key,
            Alias = alias,
            Name = name,
            IsElement = true,
            Icon = "icon-science color-blue",
        };
        foreach (var (propertyAlias, propertyName, dataType) in properties)
        {
            contentType.AddPropertyType(
                new PropertyType(shortStringHelper, dataType) { Alias = propertyAlias, Name = propertyName },
                "content",
                "Content");
        }

        if (composition is not null)
        {
            contentType.AddContentType(composition);
        }

        var result = await contentTypeService.CreateAsync(contentType, userKey);
        if (!result.Success)
        {
            logger.LogWarning("ULP seed: could not create element type {Name}: {Status}", name, result.Result);
            return null;
        }

        logger.LogInformation("ULP seed: created element type {Name}.", name);
        return contentType;
    }
}
