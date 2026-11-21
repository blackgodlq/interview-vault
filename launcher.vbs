Option Explicit
Dim fs, sh, root, nodePath, nodeFile, endpoint, request, ready, attempt, noBrowser
Set fs = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fs.GetParentFolderName(WScript.ScriptFullName)
endpoint = "http://127.0.0.1:18765"
noBrowser = False
If WScript.Arguments.Count > 0 Then noBrowser = (WScript.Arguments(0) = "--no-browser")
Function IsReady()
    On Error Resume Next
    Dim client
    Set client = CreateObject("WinHttp.WinHttpRequest.5.1")
    client.SetTimeouts 500, 500, 500, 500
    client.Open "GET", endpoint & "/api/status", False
    client.Send
    IsReady = False
    If Err.Number = 0 Then
        If client.Status = 200 Then IsReady = (InStr(client.ResponseText, "interview-agent-deepseek-v1") > 0)
    End If
    Err.Clear
    On Error GoTo 0
End Function
If Not IsReady() Then
    nodeFile = fs.BuildPath(root, "runtime-node.txt")
    If Not fs.FileExists(nodeFile) Then
        MsgBox "Node.js runtime configuration is missing.", 16, "Interview Vault"
        WScript.Quit 1
    End If
    Dim stream
    Set stream = fs.OpenTextFile(nodeFile, 1, False, -1)
    nodePath = Trim(stream.ReadAll)
    stream.Close
    If Not fs.FileExists(nodePath) Then
        MsgBox "Node.js runtime was not found. Please reinstall Node.js.", 16, "Interview Vault"
        WScript.Quit 1
    End If
    sh.CurrentDirectory = root
    sh.Run """" & nodePath & """ """ & fs.BuildPath(root, "server.cjs") & """", 0, False
    ready = False
    For attempt = 1 To 30
        WScript.Sleep 200
        If IsReady() Then
            ready = True
            Exit For
        End If
    Next
    If Not ready Then
        MsgBox "The local service could not start. Port 18765 may be occupied.", 16, "Interview Vault"
        WScript.Quit 1
    End If
End If
If Not noBrowser Then sh.Run endpoint, 1, False
