using Microsoft.JSInterop;
using Prescribe.Core.Runner;
using Prescribe.Core.Runtime;

namespace Prescribe.Web.Interop;

public sealed record RunResultDto(bool Success, string Output, string Error);

public static class PrescribeInterop
{
    private static readonly InMemoryFileSystem FileSystem = new();

    [JSInvokable("Run")]
    public static RunResultDto Run(string source, string input)
    {
        var result = PrescribeRunner.Run(source ?? "", input ?? "", FileSystem);
        return new RunResultDto(result.Success, result.Output, result.Error);
    }
}
