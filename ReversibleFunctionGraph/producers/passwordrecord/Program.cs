// Program.cs — intake for the PasswordRecord format: a file in, atoms out.
//
//   dotnet run --project producers/passwordrecord -- local/sample/example2.txt
//   dotnet run --project producers/passwordrecord -- local/sample/example2.txt --clean
//   dotnet run --project producers/passwordrecord -- local/sample/example2.txt --type PasswordRecord
//   dotnet run --project producers/passwordrecord -- FILE | ./merge.sh pile.atoms
//
// The parse itself is in PasswordRecords.cs, which passwordrecord-cut compiles
// too. This file is only the part that touches the disk.
//
// THIS IS THE OLD WAY, AND IT IS KEPT. It parses at intake, which means the
// judgment about where to stop is made once, at the only moment that cannot be
// repeated. passwordrecord-cut does the same parse against a value already in
// the pile, where it can be redone. Keeping both is what makes the comparison
// possible — run ./check.sh, and check/lost.atoms has to come out empty.

using PasswordRecord;

var rest = args.Where(a => !a.StartsWith("--")).ToArray();
var clean = args.Contains("--clean");
var typeArg = Array.IndexOf(args, "--type") is var i && i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
var path = rest.FirstOrDefault(a => a != typeArg);

if (path is null)
{
    Console.Error.WriteLine("usage: passwordrecord <file> [--clean] [--type NAME]");
    return 1;
}

var text = File.ReadAllText(path);
var (atoms, skipped) = PasswordRecords.Parse(text, typeArg ?? PasswordRecords.TypeOf(text), clean);

PasswordRecords.Write(atoms);
if (skipped > 0) Console.Error.WriteLine($"{skipped} line(s) matched nothing and were left alone");
return 0;
