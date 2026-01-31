namespace Prescribe.Core.Source;

public sealed record PrsdBlock(int Index, string Code);

public static class Prsd
{
    public static IReadOnlyList<PrsdBlock> ExtractPrescribeBlocks(string text)
    {
        var lines = text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
        var blocks = new List<PrsdBlock>();
        var inBlock = false;
        var buffer = new List<string>();
        var blockIndex = 0;

        foreach (var line in lines)
        {
            if (!inBlock)
            {
                if (line.Trim() == ":::prescribe")
                {
                    inBlock = true;
                    buffer.Clear();
                }
                continue;
            }

            if (line.Trim() == ":::")
            {
                blocks.Add(new PrsdBlock(blockIndex++, string.Join("\n", buffer)));
                inBlock = false;
                buffer.Clear();
                continue;
            }

            buffer.Add(line);
        }

        if (inBlock)
        {
            blocks.Add(new PrsdBlock(blockIndex++, string.Join("\n", buffer)));
        }

        return blocks;
    }
}
