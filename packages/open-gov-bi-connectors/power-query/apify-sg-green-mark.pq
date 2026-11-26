let
    // Required named Power Query parameter: ApifyToken.
    Token = if Value.Is(ApifyToken, type text) and Text.Trim(ApifyToken) <> "" then Text.Trim(ApifyToken) else error "Set the ApifyToken Power Query parameter.",
    ActorId = "Z3ioK0wOAeczj6nCx",
    Input = [query = "", rating = "", maxItems = 10],
    ResponseBinary = Web.Contents("https://api.apify.com", [RelativePath = "v2/acts/" & ActorId & "/run-sync-get-dataset-items", Query = [maxTotalChargeUsd = "0.25"], Headers = [Authorization = "Bearer " & Token, Accept = "application/json", #"Content-Type" = "application/json"], Content = Json.FromValue(Input), ManualStatusHandling = {400..599}]),
    Status = try Value.Metadata(ResponseBinary)[Response.Status] otherwise 200,
    Items = if Status >= 200 and Status < 300 then Json.Document(ResponseBinary) else error Error.Record("Apify HTTP error", "Request failed with status " & Text.From(Status), [Status = Status]),
    CheckedItems = if Value.Is(Items, type list) then Items else error "Apify response must be a dataset item array.",
    EscapeName = (name as text) as text => Text.Replace(Text.Replace(name, "\", "\\"), ".", "\."),
    SafeCell = (value as any) as any => if Value.Is(value, type text) and Text.Length(value) > 0 and List.Contains({"=", "+", "-", "@", Character.FromNumber(9), Character.FromNumber(13)}, Text.Start(value, 1)) then "'" & value else if Value.Is(value, type list) then Text.FromBinary(Json.FromValue(value), TextEncoding.Utf8) else value,
    FlattenRecord = (item as record, optional prefix as nullable text) as record => let Base = if prefix = null then "" else prefix, Parts = List.Transform(Record.FieldNames(item), (name) => let Value = Record.Field(item, name), Column = if Base = "" then EscapeName(name) else Base & "." & EscapeName(name) in if Value.Is(Value, type record) then @FlattenRecord(Value, Column) else Record.AddField([], Column, SafeCell(Value))), Combined = List.Accumulate(Parts, [], (state, part) => Record.Combine({state, part})) in Combined,
    Records = List.Transform(CheckedItems, each FlattenRecord(if Value.Is(_, type record) then _ else [value = _])),
    Output = if List.IsEmpty(Records) then #table({}, {}) else Table.FromRecords(Records, null, MissingField.UseNull)
in
    Output
