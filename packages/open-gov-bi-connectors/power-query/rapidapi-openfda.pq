let
    // Required named Power Query parameter: RapidApiKey.
    Key = if Value.Is(RapidApiKey, type text) and Text.Trim(RapidApiKey) <> "" then Text.Trim(RapidApiKey) else error "Set the RapidApiKey Power Query parameter.",
    Host = "openfda-recalls-enforcement-approvals.p.rapidapi.com",
    QueryAll = [dataset = "drug_enforcement", searchQuery = "", classification = "", status = "", limit = "10"],
    Query = Record.SelectFields(QueryAll, List.Select(Record.FieldNames(QueryAll), (name) => Record.Field(QueryAll, name) <> "")),
    ResponseBinary = Web.Contents("https://" & Host, [RelativePath = "v1/openfda/records", Query = Query, Headers = [#"X-RapidAPI-Key" = Key, #"X-RapidAPI-Host" = Host, Accept = "application/json"], ManualStatusHandling = {400..599}]),
    Status = try Value.Metadata(ResponseBinary)[Response.Status] otherwise 200,
    Response = if Status >= 200 and Status < 300 then Json.Document(ResponseBinary) else error Error.Record("RapidAPI HTTP error", "Request failed with status " & Text.From(Status), [Status = Status]),
    Items = if Value.Is(Response, type record) and Record.HasFields(Response, "items") and Value.Is(Response[items], type list) then Response[items] else error "RapidAPI response must contain an items array.",
    EscapeName = (name as text) as text => Text.Replace(Text.Replace(name, "\", "\\"), ".", "\."),
    SafeCell = (value as any) as any => if Value.Is(value, type text) and Text.Length(value) > 0 and List.Contains({"=", "+", "-", "@", Character.FromNumber(9), Character.FromNumber(13)}, Text.Start(value, 1)) then "'" & value else if Value.Is(value, type list) then Text.FromBinary(Json.FromValue(value), TextEncoding.Utf8) else value,
    FlattenRecord = (item as record, optional prefix as nullable text) as record => let Base = if prefix = null then "" else prefix, Parts = List.Transform(Record.FieldNames(item), (name) => let Value = Record.Field(item, name), Column = if Base = "" then EscapeName(name) else Base & "." & EscapeName(name) in if Value.Is(Value, type record) then @FlattenRecord(Value, Column) else Record.AddField([], Column, SafeCell(Value))), Combined = List.Accumulate(Parts, [], (state, part) => Record.Combine({state, part})) in Combined,
    Records = List.Transform(Items, each FlattenRecord(if Value.Is(_, type record) then _ else [value = _])),
    Output = if List.IsEmpty(Records) then #table({}, {}) else Table.FromRecords(Records, null, MissingField.UseNull)
in
    Output
