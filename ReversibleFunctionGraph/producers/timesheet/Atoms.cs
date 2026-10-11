// Atoms.cs — a sink, not a framework.
//
// This is the whole of RFG on the C# side. There is no vocabulary to declare, no
// `Def`, nothing to inherit from, and nothing your program has to be built
// around. You write ordinary C# and then say what happened, the way you would
// say it to a logger:
//
//     Atoms.Log("cost", rec, cost);
//
// An atom IS a structured log line — a name, the thing it was about, and the
// value — and this file is the sink that writes those lines in the shape the
// pile takes. Point your logging at it and you have a producer.
//
// Three ways to use it, in increasing order of getting out of the way:
//
//     Atoms.Log(...)             say it afterwards, like logger.Info
//     Atoms.Call(...)            wrap the call you wanted recorded
//     Atoms.Watch<IThing>(impl)  record every call through an interface
//
// The one thing that cannot be automated is at the bottom: the graph has one
// data type, so somebody has to say how a decimal or a DateOnly becomes text.
// That decision lives here, once, instead of at every call site.

using System.Reflection;
using System.Text.Json;

namespace Timesheet;

public static class Atoms
{
    private static readonly List<string[]> Acts = [];

    /// Say what happened: the function, its arguments, and the answer last.
    ///
    ///     Atoms.Log("cost", rec, 760m)              cost(rec) = 760
    ///     Atoms.Log("hasLetter", "cat", "z", false) hasLetter(cat,z) = false
    ///
    /// A null answer writes NOTHING. Not a blank, not a placeholder — the graph
    /// never learns the question was asked. Most strings are not an IP, and a
    /// file should grow with what was found rather than with what was asked.
    public static void Log(string fn, params object?[] rest)
    {
        if (rest.Length < 2) throw new ArgumentException("an atom needs arguments and an answer", nameof(rest));
        if (rest[^1] is null) return;

        var atom = new string[rest.Length + 1];
        atom[0] = fn;
        for (var i = 0; i < rest.Length; i++)
        {
            var s = Text(rest[i]);
            if (s is null) return;      // an argument nobody can write down
            atom[i + 1] = s;
        }
        Acts.Add(atom);
    }

    /// Run it and record it. For when you want the call written down rather than
    /// remembering to mention the result afterwards.
    public static T Call<T>(string fn, object subject, Func<T> work)
    {
        var result = work();
        Log(fn, subject, result);
        return result;
    }

    /// Record every call made through an interface. The calling code has no idea
    /// this is here — it holds an IPricing and uses it — which is as far out of
    /// the way as this gets without a source generator.
    public static T Watch<T>(T target) where T : class
    {
        var proxy = DispatchProxy.Create<T, Recorder<T>>();
        ((Recorder<T>)(object)proxy).Target = target;
        return proxy;
    }

    public static int Count => Acts.Count;

    /// One atom per line. System.Text.Json does the escaping.
    public static IEnumerable<string> Lines => Acts.Select(a => JsonSerializer.Serialize(a));

    public static async Task Flush(string? url)
    {
        if (url is null)
        {
            foreach (var line in Lines) Console.WriteLine(line);
            return;
        }
        using var http = new HttpClient();
        var res = await http.PostAsync(url, new StringContent(string.Join("\n", Lines) + "\n"));
        var added = (await res.Content.ReadAsStringAsync()).Trim();
        await Console.Error.WriteLineAsync($"sent {Count} atoms -> {url} ({added} new)");
    }

    /// THE BOUNDARY. A typed world meets an untyped one here, and the untyped
    /// side wins: everything in the graph is a string. These are the conversions
    /// this program is willing to stand behind. Anything else is a decision
    /// nobody has made, so it is refused rather than guessed at with ToString().
    private static string? Text(object? v) => v switch
    {
        null => null,
        string s => s,
        bool b => b ? "true" : "false",
        DateOnly d => d.ToString("yyyy-MM-dd"),
        decimal m => m.ToString("0.##"),
        int i => i.ToString(),
        Enum e => e.ToString(),
        _ => null,
    };

    private class Recorder<T> : DispatchProxy
    {
        public T Target = default!;

        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            var result = method!.Invoke(Target, args);
            // A method name is a function name, lowercased the way the rest of
            // the graph spells them.
            var fn = char.ToLowerInvariant(method.Name[0]) + method.Name[1..];
            Log(fn, [.. args ?? [], result]);
            return result;
        }
    }
}
