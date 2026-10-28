// Premade dictionaries, one for each kind of text in data/: picked from the list under the
// dictionaries, one is added as a new dictionary, a copy to change as you like. Each one stands on
// its own (it has every type it uses), and says which file it was made for.
export const PREMADE = [
  { name: "network addresses", file: "lab.net.txt", text: [
    "IP:[0-255].[0-255].[0-255].[0-255]",
    "Prefix:{IP}/[0-32]",
    "MAC:[hex]:[hex]:[hex]:[hex]:[hex]:[hex]",
    "Interface:eth[digits]",
  ] },
  { name: "ip neigh", file: "lab.net.txt", text: [
    "IP:[0-255].[0-255].[0-255].[0-255]",
    "MAC:[hex]:[hex]:[hex]:[hex]:[hex]:[hex]",
    "Interface:eth[digits]",
    "Neighbour:{IP} dev {Interface} lladdr {MAC}",
    "State:{Neighbour} ([word])",
  ] },
  { name: "hosts file", file: "lab.net.txt", text: [
    "IP:[0-255].[0-255].[0-255].[0-255]",
    "HostName:{IP} [spaces]([word])",
    "Alias:{HostName} ([word])",
  ] },
  { name: "nmap", file: "lab.net.txt", text: [
    "IP:[0-255].[0-255].[0-255].[0-255]",
    "MAC:[hex]:[hex]:[hex]:[hex]:[hex]:[hex]",
    "Report:Nmap scan report for [*][break]",
    "Scanned:Nmap scan report for ({IP})",
    "Port:([digits])/tcp[spaces]open",
    "Service:/tcp[spaces]open[spaces]([word])",
    "ReportMAC:{MAC} in {Report}",
  ] },
  { name: "frr config", file: "lab.net.txt", text: [
    "IP:[0-255].[0-255].[0-255].[0-255]",
    "Prefix:{IP}/[0-32]",
    "Interface:eth[digits]",
    "Router:hostname ([word])",
    "Stanza:/^interface .*(?:\\n .*)*/",
    "Address:ip address ({Prefix})",
    "StanzaInterface:{Interface} in {Stanza}",
  ] },
  { name: "internet addresses", file: "internet.txt", text: [
    "Email:/(?<![\\p{L}\\p{N}._%+-])[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)+/",
    "URL:/\\bhttps?:\\/\\/[^\\s<>\"')\\]]*[^\\s<>\"')\\].,;:!?]/",
    "IP:[0-255].[0-255].[0-255].[0-255]",
    // RFC 1918: 10/8, 172.16/12, 192.168/16
    "PrivateIP:10.[0-255].[0-255].[0-255]",
    "PrivateIP:172.[16-31].[0-255].[0-255]",
    "PrivateIP:192.168.[0-255].[0-255]",
    // everything 1-223 except: private (above), 0/8, loopback 127/8, link-local 169.254/16,
    // carrier NAT 100.64/10; 224 and up is multicast and reserved
    "RoutableIP:[1-9].[0-255].[0-255].[0-255]",
    "RoutableIP:[11-99].[0-255].[0-255].[0-255]",
    "RoutableIP:100.[0-63].[0-255].[0-255]",
    "RoutableIP:100.[128-255].[0-255].[0-255]",
    "RoutableIP:[101-126].[0-255].[0-255].[0-255]",
    "RoutableIP:[128-168].[0-255].[0-255].[0-255]",
    "RoutableIP:169.[0-253].[0-255].[0-255]",
    "RoutableIP:169.255.[0-255].[0-255]",
    "RoutableIP:[170-171].[0-255].[0-255].[0-255]",
    "RoutableIP:172.[0-15].[0-255].[0-255]",
    "RoutableIP:172.[32-255].[0-255].[0-255]",
    "RoutableIP:[173-191].[0-255].[0-255].[0-255]",
    "RoutableIP:192.[0-167].[0-255].[0-255]",
    "RoutableIP:192.[169-255].[0-255].[0-255]",
    "RoutableIP:[193-223].[0-255].[0-255].[0-255]",
  ] },
  { name: "Canadian SIN", file: "sin.txt", text: [
    // the number in its three ways: 046 454 286, 046-454-286, 046454286
    "SINFormat:[digits:3] [digits:3] [digits:3]",
    "SINFormat:[digits:3]-[digits:3]-[digits:3]",
    "SINFormat:[digits:9]",
    "SINLabel:SIN",
    "SINLabel:S.I.N.",
    "SINLabel:Social Insurance Number",
    "SINLabel:Social insurance number",
    "SINLabel:Social insurance no.",
    // a SIN: the nearest number in that form, within 300 characters after its label
    "SIN:{SINLabel}[*:..300]({SINFormat})",
  ] },
  { name: "layout", file: "any", text: [
    "Line:[line]",
    'Block:cut "\\n\\n"',
    'Word:cut {Line} on " "',
  ] },
  { name: "apple flowering groups", file: "apple.wiki.txt", text: [
    "Group:Group [A-H]",
    "Date:[1-31] May",
    "GroupLine:Group [A-H] [rest]",
  ] },
].map((d) => ({ ...d, text: d.text.join("\n") }));
