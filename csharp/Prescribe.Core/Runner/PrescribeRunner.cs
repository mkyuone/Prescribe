using System.Text;
using Prescribe.Core.Diagnostics;
using Prescribe.Core.Frontend;
using Prescribe.Core.Semantics;
using Prescribe.Core.Runtime;
using Prescribe.Core.Source;

namespace Prescribe.Core.Runner;

public sealed record PrescribeRunResult(bool Success, string Output, string Error);

public static class PrescribeRunner
{
    public static PrescribeRunResult Run(string source, string input, IFileSystem fileSystem)
    {
        var output = new StringBuilder();
        try
        {
            var blocks = Prsd.ExtractPrescribeBlocks(source);
            if (blocks.Count == 0)
            {
                blocks = new List<PrsdBlock> { new(0, source) };
            }

            foreach (var block in blocks)
            {
                if (string.IsNullOrWhiteSpace(block.Code)) continue;
                var lexer = new Lexer(block.Code);
                var parser = new Parser(lexer);
                var program = parser.ParseProgram();
                var checker = new TypeChecker();
                var sema = checker.Check(program);
                var interpreter = new Interpreter(program, sema, input, fileSystem);
                output.Append(interpreter.Run());
            }

            return new PrescribeRunResult(true, output.ToString(), "");
        }
        catch (PrescribeError err)
        {
            return new PrescribeRunResult(false, output.ToString(), ErrorReporter.Format(err));
        }
        catch (Exception ex)
        {
            return new PrescribeRunResult(false, output.ToString(), ex.Message);
        }
    }
}
