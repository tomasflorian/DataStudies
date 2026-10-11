// Program.cs — an ordinary C# program that happens to log to atoms.
//
//   dotnet run --project producers/timesheet
//   dotnet run --project producers/timesheet | ./merge.sh pile.atoms
//
// Nothing here is built around RFG. There is a record, a rate card, a bit of
// arithmetic and an interface — the code you would write anyway — and the only
// trace of the graph is the word `Atoms` appearing beside work that already
// happened. Delete every one of those lines and this is still a working program;
// it just stops saying what it did.
//
// The three ways of saying it are used in turn, and they are the same mechanism
// wearing less and less clothing:
//
//   1. Atoms.Log     say it afterwards, like logger.Info
//   2. Atoms.Call    wrap the call you wanted recorded
//   3. Atoms.Watch   record everything through an interface, call sites untouched
//
// It works on records the TypeScript producer already sent, so these atoms hang
// off nodes another program in another language made — with no arrangement
// between them beyond both writing down the same strings.

using Timesheet;

string[] rows =
[
    "bob|2026-08-25|projX|8|1",
    "alice|2026-08-25|projX|5|2",
    "bob|2026-08-26|projX|4|3",
    "bob|2026-08-25|projX|6|4",
    "carol|2026-08-27|projY|7",
    "carol|2026-08-27|projX|8",
];

var rates = new Dictionary<string, decimal> { ["projX"] = 95m, ["projY"] = 110m };
var pricing = Atoms.Watch<IPricing>(new Pricing(rates));   // (3), set up once

foreach (var row in rows)
{
    if (Entry.Parse(row) is not { } entry) continue;

    // ---- 1. as a log line ---------------------------------------------------
    //
    // Ordinary code, then a line saying what it found. `year` and `month` are
    // things combined.ts already worked out; saying them again costs nothing,
    // because the same call written down twice is the same atom.

    var date = entry.Date;
    Atoms.Log("dayOfWeek", date, date.DayOfWeek);
    Atoms.Log("year", date, date.Year);
    Atoms.Log("month", date, date.Month.ToString("00"));

    // A weekday is not a weekend, and this program has nothing to say about
    // that. Logging null writes nothing at all — no atom, no blank, no record
    // that anybody wondered.
    var weekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
    Atoms.Log("isWeekend", date, weekend ? date : null);

    // ---- 2. as a wrapper ----------------------------------------------------
    //
    // Here the call itself is the thing worth recording, so it is wrapped rather
    // than reported on afterwards. The value comes back as usual and the rest of
    // the code does not notice.

    var rate = Atoms.Call("rate", entry.Proj, () => rates.GetValueOrDefault(entry.Proj));

    // ---- 3. with nothing at the call site -----------------------------------
    //
    // `pricing` is an IPricing. This code has no idea it is being recorded, and
    // Pricing has no idea either — it is a plain class with no reference to
    // anything in this project. The proxy in Atoms.cs writes an atom per call.

    var cost = pricing.Cost(row);
    var shift = pricing.Shift(row);

    if (cost > 0m && rate > 0m) { /* ... whatever the program is actually for ... */ }
    _ = shift;
}

await Atoms.Flush(args.Length > 0 ? args[0] : null);

// --- the program's own world, which knows nothing about any of this ----------

public sealed record Entry(string Emp, DateOnly Date, string Proj, decimal Hours, int? Seq)
{
    public static Entry? Parse(string row)
    {
        var f = row.Split('|');
        if (f.Length is < 4 or > 5) return null;
        if (!DateOnly.TryParseExact(f[1], "yyyy-MM-dd", out var date)) return null;
        if (!decimal.TryParse(f[3], out var hours)) return null;
        int? seq = f.Length == 5 && int.TryParse(f[4], out var s) ? s : null;
        return new Entry(f[0], date, f[2], hours, seq);
    }
}

public enum Shift { Partial, Full }

public interface IPricing
{
    decimal Cost(string row);
    Shift Shift(string row);
}

/// Plain C#. No attribute, no base class, no mention of atoms anywhere — the
/// interface is all the proxy needs.
public sealed class Pricing(Dictionary<string, decimal> rates) : IPricing
{
    public decimal Cost(string row) =>
        Entry.Parse(row) is { } e && rates.TryGetValue(e.Proj, out var r) ? e.Hours * r : 0m;

    public Shift Shift(string row) =>
        Entry.Parse(row) is { } e && e.Hours >= 8m ? global::Shift.Full : global::Shift.Partial;
}
