// Program.cs — a cutter for the PasswordRecord format. Atoms in, atoms out.
//
//   npx tsx ingest.ts local/sample/example2.txt | dotnet run --project producers/passwordrecord-cut
//   dotnet run --project producers/passwordrecord-cut < pile.atoms | ./merge.sh pile.atoms
//
// It reads nothing off disk. It reads the pile, finds the documents already in
// it, and parses them with the SAME code producers/passwordrecord uses —
// PasswordRecords.cs, compiled into both.
//
// WHAT IT RUNS ON, AND WHY THAT IS ITS OWN BUSINESS.
//
// This cutter runs on blobs: values that some ingester wrote down whole, which
// in an atom line looks like
//
//     ["isblob", <the whole text>, <the whole text>]
//
// One hop of context, and it is sitting in slot 0 of the line. No graph needed.
// The rule lives HERE and not in the pile, because a cutter that reads its own
// policy out of shared state is a cutter coordinating with other cutters, and
// nothing else in this design does that.
//
// It matters that the rule is narrow. Run this parser over every value instead
// and the BitLocker recovery document would qualify — it has an unindented
// "Identifier:" line and indented lines under it — so a note inside a record
// would be cut up as if it were a second file of records. Choosing what a cutter
// is pointed at is most of what a cutter is.
//
// THE TWO RULES that make re-running safe (see the README, "Three roles"):
//
//   Pure.      Same atoms in, same atoms out. Nothing here reads a clock, a
//              filename, or a counter.
//   Monotone.  It never asks what is MISSING from the pile. It looks only at
//              what is there, so a bigger pile can only ever get you more, and
//              running the cutters in a different order lands in the same place.
//
// WHAT IT ADDS THAT INTAKE COULD NOT: cameFrom.
//
//     ["cameFrom", "PasswordRecord:61", <the whole document>]
//
// The record was taken out of that document. ingest.ts already wrote
// cameFrom(document) = the path, so the same function chains: a field value
// walks back to its record, the record to the document it was cut from, and the
// document to the file it arrived as. The old intake path could not write this
// at all — the document was never a node, so there was nothing to point at.

using System.Text.Json;
using PasswordRecord;

var clean = args.Contains("--clean");
var typeArg = Array.IndexOf(args, "--type") is var i && i >= 0 && i + 1 < args.Length ? args[i + 1] : null;

var blobs = new List<string>();
var seen = new HashSet<string>();

string? line;
while ((line = Console.In.ReadLine()) is not null)
{
    if (line.Trim().Length == 0) continue;

    string[]? atom;
    try { atom = JsonSerializer.Deserialize<string[]>(line); }
    catch (JsonException) { continue; }        // not an atom line; leave it alone
    if (atom is null || atom.Length < 3) continue;

    // the selection, and the whole of it
    if (atom[0] != "isblob") continue;

    var blob = atom[^1];
    if (seen.Add(blob)) blobs.Add(blob);
}

var all = new List<string[]>();
var cut = 0;

foreach (var blob in blobs)
{
    var type = typeArg ?? PasswordRecords.TypeOf(blob);
    var (atoms, _) = PasswordRecords.Parse(blob, type, clean);

    // A blob that yields no record is not this cutter's kind of document, and it
    // says nothing about it. A cutter is allowed to decline, and declining writes
    // nothing down — same as a function that returns null.
    var records = atoms.Where(a => a[0] == type && a[1] == a[2]).Select(a => a[1]).Distinct().ToList();
    if (records.Count == 0) continue;

    all.AddRange(atoms);
    foreach (var record in records) all.Add(["cameFrom", record, blob]);
    cut++;
}

PasswordRecords.Write(all);
Console.Error.WriteLine($"{blobs.Count} blob(s) seen, {cut} cut");
return 0;
