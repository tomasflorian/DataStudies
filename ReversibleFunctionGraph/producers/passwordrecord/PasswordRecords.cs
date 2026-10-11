// PasswordRecords.cs — the parse, and nothing else.
//
// This file was lifted out of Program.cs UNCHANGED so that two programs can
// compile the same code:
//
//   producers/passwordrecord       reads the file off disk       (intake)
//   producers/passwordrecord-cut   reads the same text out of an atom  (a cutter)
//
// That is the whole point of the split. If the parsing lived twice, the two
// paths could drift and the check that "when" does not change "what" would be
// checking two parsers instead of one. ./check.sh is where that is proved.
//
// The format:
//
//     PasswordRecord:61
//         Username:ssh-ed25519 ... alice@workstation
//         Password:...
//         Notes:BitLocker\ Recovery\ Key\ ....TXT
//     @@@first line of a multiline value
//     @@@second line
//
// A header line starts a record. Indented `Name:value` lines are its fields. A
// line starting with @@@ continues the field above it — the format's clumsy way
// of writing Notes:"multi\nline\nstring".
//
// IT DOES NOT PARSE EVERYTHING, ON PURPOSE. A record's identity is its header
// line exactly as written — "PasswordRecord:61" — and is not broken into a type
// and a number. Field values are not cut further: the whole BitLocker document
// is one value. A parser is allowed to stop, and where it stops is a judgment
// about what is worth being a node, not a limit of the format. What changed with
// cutters is that the judgment is no longer permanent — whatever this one leaves
// whole, a later one can pick up.
//
// EVERY RECORD IS ALSO WRITTEN DOWN AS EXISTING:
//
//     ["PasswordRecord","PasswordRecord:61","PasswordRecord:61"]
//
// A function that hands back its own input — the same shape as isIP, hasFormat,
// and the isblob that ingest.ts writes for a whole document. Without it a record
// is only implied by whatever fields it happens to carry, and there is no anchor
// that reaches all of them: three records here have no Username at all. With it,
// PasswordRecord is a node you can click, count, and start a walk from.
//
// Expect gnarly atoms. A field value here can be a page of text, and the same
// page appearing in fifty records is one node with fifty arrows into it. That
// repetition is the collision, not waste.

using System.Text;
using System.Text.Json;
using System.Text.Encodings.Web;

namespace PasswordRecord;

public static class PasswordRecords
{
    // Relaxed escaping so an apostrophe stays an apostrophe. .NET's default writes
    // ', which is the same string but not the same LINE — and the pile drops
    // duplicates byte for byte, so a fact written here and in JavaScript would be
    // held twice. The graph would still be right; the file would just be fatter.
    public static readonly JsonSerializerOptions Json =
        new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public static void Write(IEnumerable<string[]> atoms)
    {
        foreach (var atom in atoms) Console.WriteLine(JsonSerializer.Serialize(atom, Json));
    }

    // The record type is whatever the first unindented `Name:` line is called, so
    // this reads any file shaped like this one without being told.
    public static string TypeOf(string text) =>
        text.Replace("\r\n", "\n").Split('\n')
            .Select(l => l.TrimEnd('\r'))
            .Where(l => l.Length > 0 && !char.IsWhiteSpace(l[0]) && l.Contains(':'))
            .Select(l => l[..l.IndexOf(':')])
            .FirstOrDefault() ?? "Record";

    // --- the parse -----------------------------------------------------------

    public static (List<string[]>, int) Parse(string text, string recordType, bool clean)
    {
        var atoms = new List<string[]>();
        var skipped = 0;

        string? record = null;   // the header line, verbatim: the record's identity
        string? field = null;    // the field currently being filled
        var value = new StringBuilder();

        // A field is finished when the next field, the next record, or the end of the
        // file arrives — not when its first line ends, because @@@ may follow.
        void Close()
        {
            if (record is null || field is null) return;
            var v = clean ? Clean(value.ToString()) : value.ToString();
            // A field with nothing in it writes NOTHING. No atom, no blank, no record
            // that anybody looked. Absence is the answer.
            if (v.Length > 0) atoms.Add([field, record, v]);
            field = null;
            value.Clear();
        }

        // A value written on one line by replacing its newlines with @@@ can leave a
        // stray CR of a CRLF sitting in front of the marker. Put it back first.
        text = text.Replace("\r\n", "\n").Replace("\r@@@", "\n@@@");

        foreach (var raw in text.Split('\n'))
        {
            var line = raw.TrimEnd('\r');

            if (line.StartsWith(recordType + ":"))
            {
                Close();
                record = line.Trim();
                // The record exists, and this is what it is. A function handing back
                // its own input — see the header.
                atoms.Add([recordType, record, record]);
                continue;
            }

            // @@@ continues the field above. The marker is stripped and the rest is
            // kept exactly, including its leading spaces — indentation inside a
            // document is part of the document.
            if (line.StartsWith("@@@"))
            {
                if (field is null) { skipped++; continue; }
                value.Append('\n').Append(line[3..].Replace("@@@", "\n"));
                continue;
            }

            // An indented Name:value line. Split on the FIRST colon only — values
            // hold colons all the time (a URL, an "Identifier:" heading).
            var trimmed = line.TrimStart();
            var colon = trimmed.IndexOf(':');
            if (record is not null && line.Length > trimmed.Length && colon > 0)
            {
                Close();
                field = trimmed[..colon];
                value.Append(trimmed[(colon + 1)..].Replace("@@@", "\n"));
                continue;
            }

            if (line.Length > 0) skipped++;
        }
        Close();

        return (atoms, skipped);
    }

    // --- the cleaner ---------------------------------------------------------
    //
    // Separate, and off unless asked for, because cleaning is not neutral. Node
    // identity is exact text: a value carrying a stray byte-order mark never meets
    // anything, and trimming it is a connection being authored on the data's behalf.
    // Nothing else here authors one, so this is kept where it can be seen and
    // switched off. Run the file both ways and put both piles in — the graph will
    // show you what the cleaning was worth.
    public static string Clean(string v)
    {
        var sb = new StringBuilder(v.Length);

        for (var i = 0; i < v.Length; i++)
        {
            var c = v[i];

            // shell-style escaped space, as the format writes filenames
            if (c == '\\' && i + 1 < v.Length && v[i + 1] == ' ') { sb.Append(' '); i++; continue; }

            // control characters and the byte-order mark that survives a UTF-16
            // file being pasted into a UTF-8 one. Newline and tab are content.
            if (c == '\n' || c == '\t') { sb.Append(c); continue; }
            if (char.IsControl(c) || c == '﻿') continue;

            sb.Append(c);
        }

        // trailing whitespace on any line, and on the value as a whole
        var lines = sb.ToString().Split('\n').Select(l => l.TrimEnd());
        return string.Join('\n', lines).Trim('\n');
    }
}
