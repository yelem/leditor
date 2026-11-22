param(
  [Parameter(Mandatory = $true)][string]$Mode,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Path = ''
)
# Word automation for the editor test suite.
#   paste      - paste the current clipboard into a new document, dump paragraphs
#   make-copy  - build a formatted document, copy it, dump the clipboard html/text
#   open       - open a file (exported docx), dump paragraphs
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

function Dump-Paragraphs($doc) {
  $list = @()
  foreach ($p in $doc.Paragraphs) {
    $r = $p.Range
    $list += [ordered]@{
      text      = ($r.Text -replace "`r$", '' -replace "`a", '')
      style     = $p.Style.NameLocal
      firstLine = [math]::Round($p.FirstLineIndent, 1)
      left      = [math]::Round($p.LeftIndent, 1)
      align     = $p.Alignment
      listType  = $r.ListFormat.ListType
      bold      = $r.Bold
      italic    = $r.Italic
      underline = $r.Underline
      strike    = $r.Font.StrikeThrough
    }
  }
  return $list
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  if ($Mode -eq 'paste') {
    $doc = $word.Documents.Add()
    $word.Selection.Paste()
    $result = @{ paragraphs = @(Dump-Paragraphs $doc) }
    $doc.Saved = $true; $doc.Close()
  }
  elseif ($Mode -eq 'open') {
    $doc = $word.Documents.Open($Path, $false, $true)
    $result = @{ paragraphs = @(Dump-Paragraphs $doc) }
    $doc.Saved = $true; $doc.Close()
  }
  elseif ($Mode -eq 'make-copy' -or $Mode -eq 'hold') {
    $doc = $word.Documents.Add()
    $s = $word.Selection
    $s.Style = $doc.Styles.Item(-2)            # Heading 1
    $s.TypeText('Word heading')
    $s.TypeParagraph()
    $s.Style = $doc.Styles.Item(-1)            # Normal
    $s.ParagraphFormat.FirstLineIndent = 35.45 # 1.25 cm
    $s.TypeText('Indented first line with ')
    $s.Font.Bold = $true; $s.TypeText('bold'); $s.Font.Bold = $false
    $s.TypeText(' and ')
    $s.Font.Italic = $true; $s.TypeText('italic'); $s.Font.Italic = $false
    $s.TypeText('.')
    $s.TypeParagraph()
    $s.ParagraphFormat.FirstLineIndent = 0
    $s.TypeText("Two  spaces and a`ttab inside.")
    $s.TypeParagraph()
    $s.TypeParagraph()                         # an empty paragraph
    $s.TypeText('After the empty one: ' + [char]0x00AB + 'Quoted' + [char]0x00BB + ' ' + [char]0x2014 + ' dash.')
    $s.TypeParagraph()
    $s.Range.ListFormat.ApplyBulletDefault()
    $s.TypeText('Bullet one')
    $s.TypeParagraph()
    $s.TypeText('Bullet two')
    $s.TypeParagraph()
    $s.Range.ListFormat.ListIndent()
    $s.TypeText('Nested bullet')
    $s.TypeParagraph()
    $s.Range.ListFormat.ListOutdent()
    $s.TypeText('Bullet three')
    $s.TypeParagraph()
    $s.Range.ListFormat.RemoveNumbers()
    $s.Range.ListFormat.ApplyNumberDefault()
    $s.TypeText('Numbered one')
    $s.TypeParagraph()
    $s.TypeText('Numbered two')
    $s.TypeParagraph()
    $s.Range.ListFormat.RemoveNumbers()
    $s.ParagraphFormat.LeftIndent = 0
    $s.ParagraphFormat.FirstLineIndent = 35.45
    $s.TypeText(('Long paragraph with a first line indent that goes on and on so that Word has to wrap its html source somewhere in the middle of the text. ' * 3) + 'End  with  doubles.')
    $doc.Content.Select()
    $word.Selection.Copy()
    Start-Sleep -Milliseconds 300
    $result = @{
      html = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::Default.GetBytes([System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::Html)))
      text = [System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::UnicodeText)
      rtfLength = ([System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::Rtf)).Length
    }
    if ($Mode -eq 'hold') {
      # Keep Word (and its clipboard) alive until the suite has pasted.
      [System.IO.File]::WriteAllText($Out + '.ready', '')
      $deadline = (Get-Date).AddSeconds(90)
      while (-not (Test-Path ($Out + '.release')) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
    }
    $doc.Saved = $true; $doc.Close()
  }
  else { throw "unknown mode $Mode" }
  $json = $result | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding($false)))
}
finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
